import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  doctors,
  patients,
  treatmentTypes,
  priceList,
  cases,
  payments,
  appointments,
  cashMovements,
  auditLog,
  expenses,
} from "@/lib/db/schema";
import { cashOnHand, getSettings } from "@/lib/server-utils";
import { currentPeriod, todayISO } from "@/lib/dates";

// Correlated "amount paid on a case" (refunds are negative, so they net out).
const paidExpr = sql<number>`coalesce((select sum(p.amount) from payments p where p.case_id = cases.id), 0)`;

// ── Reference lists ─────────────────────────────────────────────────────────
export function listDoctors(opts: { activeOnly?: boolean } = {}) {
  const q = db.select().from(doctors).orderBy(doctors.sortOrder);
  const rows = q.all();
  return opts.activeOnly ? rows.filter((d) => d.isActive) : rows;
}

export function listTreatmentTypes() {
  return db
    .select({
      id: treatmentTypes.id,
      key: treatmentTypes.key,
      nameAr: treatmentTypes.nameAr,
      nameEn: treatmentTypes.nameEn,
      settlementBucket: treatmentTypes.settlementBucket,
      isImplant: treatmentTypes.isImplant,
      isOrtho: treatmentTypes.isOrtho,
      defaultPrice: sql<number>`coalesce(${priceList.defaultPrice}, 0)`,
      isPlaceholder: priceList.isPlaceholder,
    })
    .from(treatmentTypes)
    .leftJoin(priceList, eq(priceList.treatmentTypeId, treatmentTypes.id))
    .where(eq(treatmentTypes.isActive, true))
    .orderBy(treatmentTypes.sortOrder)
    .all();
}

export function getTreatmentType(id: number) {
  return db.select().from(treatmentTypes).where(eq(treatmentTypes.id, id)).get();
}

// ── Patients ────────────────────────────────────────────────────────────────
export function searchPatients(q: string, limit = 30) {
  const term = `%${q.trim()}%`;
  const base = db.select().from(patients);
  const rows = q.trim()
    ? base
        .where(sql`${patients.fullName} like ${term} or ${patients.phone} like ${term}`)
        .orderBy(patients.fullName)
        .limit(limit)
        .all()
    : base.orderBy(desc(patients.id)).limit(limit).all();
  return rows;
}

export function patientById(id: number) {
  return db.select().from(patients).where(eq(patients.id, id)).get();
}

// ── Cases ───────────────────────────────────────────────────────────────────
export interface CaseRow {
  id: number;
  patientId: number;
  patientName: string;
  doctorId: number;
  doctorName: string;
  treatment: string;
  bucket: string;
  isImplant: boolean;
  isOrtho: boolean;
  status: string;
  openedDate: string;
  totalPrice: number;
  paid: number;
  remaining: number;
  implantCardNo: number | null;
  accountSeqNo: number | null;
}

const caseSelect = {
  id: cases.id,
  patientId: cases.patientId,
  patientName: patients.fullName,
  doctorId: cases.doctorId,
  doctorName: doctors.name,
  treatment: treatmentTypes.nameAr,
  bucket: treatmentTypes.settlementBucket,
  isImplant: treatmentTypes.isImplant,
  isOrtho: treatmentTypes.isOrtho,
  status: cases.status,
  openedDate: cases.openedDate,
  totalPrice: cases.totalPrice,
  paid: paidExpr,
  remaining: sql<number>`${cases.totalPrice} - (${paidExpr})`,
  implantCardNo: cases.implantCardNo,
  accountSeqNo: cases.accountSeqNo,
} as const;

function caseBase() {
  return db
    .select(caseSelect)
    .from(cases)
    .innerJoin(patients, eq(cases.patientId, patients.id))
    .innerJoin(doctors, eq(cases.doctorId, doctors.id))
    .innerJoin(treatmentTypes, eq(cases.treatmentTypeId, treatmentTypes.id));
}

export function casesForPatient(patientId: number): CaseRow[] {
  return caseBase().where(eq(cases.patientId, patientId)).orderBy(desc(cases.openedDate)).all();
}

export function openCasesForPatient(patientId: number): CaseRow[] {
  return caseBase()
    .where(and(eq(cases.patientId, patientId), eq(cases.status, "open")))
    .orderBy(desc(cases.openedDate))
    .all();
}

export function caseWithDetails(caseId: number) {
  return caseBase().where(eq(cases.id, caseId)).get();
}

/** Full case record (all columns) for editing forms. */
export function caseRaw(caseId: number) {
  return db.select().from(cases).where(eq(cases.id, caseId)).get();
}

export function paymentsForCase(caseId: number) {
  return db
    .select({
      id: payments.id,
      amount: payments.amount,
      kind: payments.kind,
      paidDate: payments.paidDate,
      note: payments.note,
      doctorId: payments.doctorId,
      doctorName: doctors.name,
    })
    .from(payments)
    .innerJoin(doctors, eq(payments.doctorId, doctors.id))
    .where(eq(payments.caseId, caseId))
    .orderBy(desc(payments.paidDate), desc(payments.id))
    .all();
}

// ── Daily ledger ────────────────────────────────────────────────────────────
export function dailyLedger(date: string) {
  return db
    .select({
      paymentId: payments.id,
      amount: payments.amount,
      kind: payments.kind,
      note: payments.note,
      doctorId: doctors.id,
      doctorName: doctors.name,
      doctorSort: doctors.sortOrder,
      caseId: cases.id,
      treatment: treatmentTypes.nameAr,
      bucket: treatmentTypes.settlementBucket,
      patientName: patients.fullName,
      implantCardNo: cases.implantCardNo,
    })
    .from(payments)
    .innerJoin(cases, eq(payments.caseId, cases.id))
    .innerJoin(doctors, eq(payments.doctorId, doctors.id))
    .innerJoin(treatmentTypes, eq(cases.treatmentTypeId, treatmentTypes.id))
    .innerJoin(patients, eq(cases.patientId, patients.id))
    .where(eq(payments.paidDate, date))
    .orderBy(doctors.sortOrder, payments.id)
    .all();
}

/**
 * Cases that can still take money, for the daily "دفعة" picker.
 * Searchable + capped: Dr. Adi alone has 500–820 implant cards, so an
 * unbounded list here is unusable at real clinic scale. [D3]
 * Includes `completed` cases that still carry a balance — the clinic is still
 * chasing that money. [A4]
 */
export function openCasesBrief(q = "", limit = 40) {
  const term = `%${q.trim()}%`;
  const collectable = sql`${cases.status} != 'cancelled' and (${cases.totalPrice} - (${paidExpr})) > 0`;

  return db
    .select({
      id: cases.id,
      patientName: patients.fullName,
      phone: patients.phone,
      treatment: treatmentTypes.nameAr,
      remaining: sql<number>`${cases.totalPrice} - (${paidExpr})`,
    })
    .from(cases)
    .innerJoin(patients, eq(cases.patientId, patients.id))
    .innerJoin(treatmentTypes, eq(cases.treatmentTypeId, treatmentTypes.id))
    .where(
      q.trim()
        ? and(
            collectable,
            sql`(${patients.fullName} like ${term} or ${patients.phone} like ${term})`,
          )
        : collectable,
    )
    .orderBy(desc(cases.openedDate), desc(cases.id))
    .limit(Math.min(200, Math.max(1, limit)))
    .all();
}

/** How many collectable cases exist, so the picker can say it is truncated. */
export function collectableCaseCount(): number {
  return (
    db
      .select({ v: sql<number>`count(*)` })
      .from(cases)
      .where(sql`${cases.status} != 'cancelled' and (${cases.totalPrice} - (${paidExpr})) > 0`)
      .get()?.v ?? 0
  );
}

// ── Appointments (السجل الرئيسي) [B1] ────────────────────────────────────────
/** One day's bookings: who is expected, with which doctor, and did they come. */
export function appointmentsForDate(date: string) {
  return db
    .select({
      id: appointments.id,
      patientId: appointments.patientId,
      patientName: patients.fullName,
      phone: patients.phone,
      doctorId: appointments.doctorId,
      doctorName: doctors.name,
      apptDate: appointments.apptDate,
      status: appointments.status,
      note: appointments.note,
    })
    .from(appointments)
    .innerJoin(patients, eq(appointments.patientId, patients.id))
    .leftJoin(doctors, eq(appointments.doctorId, doctors.id))
    .where(eq(appointments.apptDate, date))
    .orderBy(doctors.sortOrder, appointments.id)
    .all();
}

/** Counts for the day header: expected / came / didn't come. */
export function appointmentCountsForDate(date: string) {
  const rows = db
    .select({ status: appointments.status, n: sql<number>`count(*)` })
    .from(appointments)
    .where(eq(appointments.apptDate, date))
    .groupBy(appointments.status)
    .all();
  const by = (s: string) => rows.find((r) => r.status === s)?.n ?? 0;
  return {
    booked: by("booked"),
    came: by("came"),
    noShow: by("no_show"),
    total: rows.reduce((sum, r) => sum + r.n, 0),
  };
}

// ── Debts call-list (سجل الديون) ─────────────────────────────────────────────
/**
 * Outstanding balances for the call-list. Phone and last-payment date are
 * correlated sub-selects rather than a query per row (was 2N+1). [D6]
 */
export function debtsList() {
  return db
    .select({
      ...caseSelect,
      phone: patients.phone,
      lastPaymentDate: sql<
        string | null
      >`(select max(p.paid_date) from payments p where p.case_id = cases.id)`,
    })
    .from(cases)
    .innerJoin(patients, eq(cases.patientId, patients.id))
    .innerJoin(doctors, eq(cases.doctorId, doctors.id))
    .innerJoin(treatmentTypes, eq(cases.treatmentTypeId, treatmentTypes.id))
    .where(sql`(${cases.totalPrice} - (${paidExpr})) > 0 and ${cases.status} != 'cancelled'`)
    .orderBy(sql`(${cases.totalPrice} - (${paidExpr})) desc`)
    .all();
}

// ── Implant index (سجل فهرس الزراعة) ─────────────────────────────────────────
export function implantIndex(q = "") {
  const rows = caseBase()
    .where(eq(treatmentTypes.isImplant, true))
    .orderBy(cases.implantCardNo)
    .all();
  if (!q.trim()) return rows;
  const term = q.trim().toLowerCase();
  return rows.filter(
    (r) =>
      r.patientName.toLowerCase().includes(term) ||
      String(r.implantCardNo ?? "").includes(term) ||
      String(r.accountSeqNo ?? "").includes(term),
  );
}

// ── Ortho register (سجل التقويم) ─────────────────────────────────────────────
export function orthoCases(q = "") {
  const rows = db
    .select({
      ...caseSelect,
      hasComplaint: cases.hasComplaint,
      complaintNote: cases.complaintNote,
      nextAppointment: cases.nextAppointment,
      phone: patients.phone,
    })
    .from(cases)
    .innerJoin(patients, eq(cases.patientId, patients.id))
    .innerJoin(doctors, eq(cases.doctorId, doctors.id))
    .innerJoin(treatmentTypes, eq(cases.treatmentTypeId, treatmentTypes.id))
    .where(eq(treatmentTypes.isOrtho, true))
    .orderBy(desc(cases.openedDate))
    .all();
  if (!q.trim()) return rows;
  const term = q.trim().toLowerCase();
  return rows.filter((r) => r.patientName.toLowerCase().includes(term));
}

// ── Expenses (سجل الصرفيات) ──────────────────────────────────────────────────
export function expensesForMonth(period: string) {
  const rows = db
    .select()
    .from(expenses)
    .where(sql`substr(${expenses.expenseDate}, 1, 7) = ${period}`)
    .orderBy(desc(expenses.expenseDate), desc(expenses.id))
    .all();
  const byCategory = db
    .select({ category: expenses.category, total: sql<number>`sum(${expenses.amount})` })
    .from(expenses)
    .where(sql`substr(${expenses.expenseDate}, 1, 7) = ${period}`)
    .groupBy(expenses.category)
    .all();
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return { rows, byCategory, total };
}

// ── Cash movements (الحركات النقدية) [B2] ────────────────────────────────────
/** Non-payment cash in/out for a month: reserves, withdrawals, draws, payouts. */
export function cashMovementsForMonth(period: string) {
  const rows = db
    .select()
    .from(cashMovements)
    .where(sql`substr(${cashMovements.moveDate}, 1, 7) = ${period}`)
    .orderBy(desc(cashMovements.moveDate), desc(cashMovements.id))
    .all();
  const inflow = rows.reduce((s, r) => (r.amount > 0 ? s + r.amount : s), 0);
  const outflow = rows.reduce((s, r) => (r.amount < 0 ? s + r.amount : s), 0);
  return { rows, inflow, outflow, net: inflow + outflow };
}

// ── Audit log (سجل التعديلات — replaces the كبير/صغير duplication) [B3] ───────
export interface AuditFilter {
  entity?: string;
  onlyClosedPeriod?: boolean;
  limit?: number;
}

export function auditTrail(filter: AuditFilter = {}) {
  const limit = Math.min(500, Math.max(1, filter.limit ?? 200));
  const conditions = [];
  if (filter.entity) conditions.push(eq(auditLog.entity, filter.entity));
  if (filter.onlyClosedPeriod) conditions.push(eq(auditLog.hitClosedPeriod, true));

  const q = db.select().from(auditLog);
  const rows = (conditions.length ? q.where(and(...conditions)) : q)
    .orderBy(desc(auditLog.id))
    .limit(limit)
    .all();
  return rows;
}

/** Distinct entities present in the log, for the filter dropdown. */
export function auditEntities(): string[] {
  return db
    .selectDistinct({ entity: auditLog.entity })
    .from(auditLog)
    .orderBy(auditLog.entity)
    .all()
    .map((r) => r.entity);
}

/** Count of edits that landed inside an already-closed month. [D4] */
export function closedPeriodEditCount(): number {
  return (
    db
      .select({ v: sql<number>`count(*)` })
      .from(auditLog)
      .where(eq(auditLog.hitClosedPeriod, true))
      .get()?.v ?? 0
  );
}

// ── Dashboard ───────────────────────────────────────────────────────────────
export function dashboardStats() {
  const today = todayISO();
  const period = currentPeriod();
  const monthFilter = sql`substr(${payments.paidDate}, 1, 7) = ${period}`;

  const todayCollected =
    db.select({ v: sql<number>`coalesce(sum(${payments.amount}),0)` }).from(payments).where(eq(payments.paidDate, today)).get()?.v ?? 0;
  const monthCollected =
    db.select({ v: sql<number>`coalesce(sum(${payments.amount}),0)` }).from(payments).where(monthFilter).get()?.v ?? 0;
  const monthExpenses =
    db.select({ v: sql<number>`coalesce(sum(${expenses.amount}),0)` }).from(expenses).where(sql`substr(${expenses.expenseDate},1,7) = ${period}`).get()?.v ?? 0;
  const outstanding =
    db.select({ v: sql<number>`coalesce(sum(${cases.totalPrice} - (${paidExpr})),0)` }).from(cases).where(sql`(${cases.totalPrice} - (${paidExpr})) > 0 and ${cases.status} != 'cancelled'`).get()?.v ?? 0;
  const openImplants =
    db.select({ v: sql<number>`count(*)` }).from(cases).innerJoin(treatmentTypes, eq(cases.treatmentTypeId, treatmentTypes.id)).where(and(eq(treatmentTypes.isImplant, true), eq(cases.status, "open"))).get()?.v ?? 0;

  // Net of refunds (stored negative), so these rows always sum to
  // monthCollected above and to the settlement screen. [A7]
  const perDoctorMonth = db
    .select({
      doctorId: doctors.id,
      doctorName: doctors.name,
      collected: sql<number>`coalesce(sum(${payments.amount}),0)`,
    })
    .from(doctors)
    .leftJoin(payments, and(eq(payments.doctorId, doctors.id), monthFilter))
    .groupBy(doctors.id)
    .orderBy(doctors.sortOrder)
    .all();

  const apptToday = appointmentCountsForDate(today);

  const s = getSettings();
  const cash = cashOnHand();
  return {
    today,
    period,
    cash,
    overReserve: cash > s.cashReserveThreshold,
    reserveThreshold: s.cashReserveThreshold,
    todayCollected,
    monthCollected,
    monthExpenses,
    outstanding,
    openImplants,
    apptToday,
    perDoctorMonth,
  };
}
