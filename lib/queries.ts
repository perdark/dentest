import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  doctors,
  patients,
  treatmentTypes,
  cases,
  payments,
  appointments,
  cashMovements,
  auditLog,
  expenses,
  labEntries,
  xrayFilms,
  caseTeeth,
} from "@/lib/db/schema";
import { getTooth, type Surface } from "@/lib/db/teeth";
import { cashOnHand, getSettings } from "@/lib/server-utils";
import { currentPeriod, shiftISOByDays, todayISO } from "@/lib/dates";
import { ORTHO_BUCKET, XRAY_BUCKET } from "@/lib/strings";

/**
 * The appointment status column is a union, so a filter arriving as a raw query
 * string has to be narrowed before it can be compared — an unknown ?status is
 * dropped rather than passed through to SQL.
 */
type ApptStatus = "booked" | "came" | "no_show";
function isApptStatus(s: string | undefined | null): s is ApptStatus {
  return s === "booked" || s === "came" || s === "no_show";
}

// Correlated "amount paid on a case" (refunds are negative, so they net out).
const paidExpr = sql<number>`coalesce((select sum(p.amount) from payments p where p.case_id = cases.id), 0)`;

/**
 * التقويم لا يُحسب ديناً على المريض أبداً. [قرار العيادة 2026-08-19]
 *
 * لا يوجد إجمالي متفق عليه في التقويم، فالفرق بين إجمالي الحالة والمدفوع ليس
 * رصيداً مطلوباً. الاستثناء بالدلو لا بالإجمالي، حتى تخرج معه الحالات القديمة
 * التي ما زالت تحمل إجمالياً محفوظاً في قاعدة البيانات.
 */
const notOrtho = sql`${treatmentTypes.settlementBucket} <> ${ORTHO_BUCKET}`;

/**
 * Does the system hold any clinical record at all?
 *
 * Patients are the right proxy: nothing else — a case, a payment, an
 * appointment — can exist without one. Used to decide whether a demo fill is
 * safe and whether the app is on its very first run.
 */
export function hasAnyRecords(): boolean {
  return !!db.select({ id: patients.id }).from(patients).limit(1).get();
}

// ── Reference lists ─────────────────────────────────────────────────────────
/** The three kinds of work a doctor can be marked for. Mirrors the settlement
 *  buckets a doctor can earn in — «أشعة» is clinic income and has no doctor. [D9] */
export type DoctorWork = "implant" | "ortho" | "normal";

export function listDoctors(
  opts: { activeOnly?: boolean; does?: DoctorWork } = {},
) {
  const q = db.select().from(doctors).orderBy(doctors.sortOrder);
  const rows = q.all();
  const active = opts.activeOnly ? rows.filter((d) => d.isActive) : rows;
  if (!opts.does) return active;

  const does = opts.does;
  const matching = active.filter((d) =>
    does === "ortho" ? d.doesOrtho : does === "implant" ? d.doesImplants : d.doesNormal,
  );

  /*
   * Never hand a screen an empty picker.
   *
   * If no doctor is marked for this work the clinic simply has not filled the
   * checkboxes in yet — that is a blank setting, not an instruction to make the
   * screen unusable. Falling back to the full list keeps «الدفتر اليومي» and
   * «الزراعة» working exactly as they did before anyone touched «الأطباء»,
   * which is also what makes this safe to ship to a clinic mid-use.
   */
  return matching.length > 0 ? matching : active;
}

/**
 * أنواع العلاج المُفعّلة — بلا سعر.
 *
 * «قائمة الأسعار» أُزيلت 2026-08-19: أسعار العيادة تختلف من مريض إلى آخر،
 * فيُكتب السعر في كل حالة على حدة ولا يقترحه النظام. جدول `price_list` بقي في
 * قاعدة البيانات خاملاً (بياناته التاريخية وسجل تعديلاته لا تُحذف).
 */
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
    })
    .from(treatmentTypes)
    .where(eq(treatmentTypes.isActive, true))
    .orderBy(treatmentTypes.sortOrder)
    .all();
}

export function getTreatmentType(id: number) {
  return db.select().from(treatmentTypes).where(eq(treatmentTypes.id, id)).get();
}

/**
 * الاقتراحات أسفل حقل «العلاج» في الدفتر اليومي — الأسماء المستعملة سابقاً.
 *
 * Only the `normal` bucket: implants, ortho and X-rays are opened from their
 * own screens, so offering their names here would only invite the refusal the
 * mutation would answer with. [D9]
 *
 * Ordered by the last time each name was actually used, so the treatments this
 * clinic does every day sit at the top and a name typed once a year sinks. The
 * correlation is written as `"treatment_types"."id"` on purpose: a single-table
 * select renders an interpolated column as a bare `id`, which inside a
 * sub-select aliasing `cases c` would resolve to the case's own id. [D3]
 */
export function normalTreatmentSuggestions(limit = 30) {
  const lastUsed = sql<string | null>`(
    select max(c.opened_date) from cases c
    where c.treatment_type_id = "treatment_types"."id"
  )`;
  return db
    .select({ id: treatmentTypes.id, nameAr: treatmentTypes.nameAr })
    .from(treatmentTypes)
    .where(
      and(
        eq(treatmentTypes.isActive, true),
        eq(treatmentTypes.settlementBucket, "normal"),
      ),
    )
    .orderBy(sql`${lastUsed} desc nulls last`, treatmentTypes.sortOrder)
    .limit(Math.min(100, Math.max(1, limit)))
    .all();
}

// ── Patients ────────────────────────────────────────────────────────────────
export interface PatientsListOptions {
  /** جزء من الاسم أو رقم الهاتف. */
  q?: string;
  /** المرضى الذين عالجهم هذا الطبيب. */
  doctorId?: number;
  /** المرضى الذين عليهم رصيد متبقٍ. */
  hasBalance?: boolean;
  /** المرضى الذين راجعوا خلال هذا العدد من الأيام. */
  visitedWithinDays?: number;
}

/**
 * قائمة المرضى مع الفلاتر — كلها على الخادم.
 *
 * Every filter is an `exists` sub-select rather than a join: a patient with
 * four cases must appear once, and once only, whichever filters are combined.
 * The correlation is written as `"patients"."id"` on purpose — a single-table
 * select renders an interpolated column as a bare `id`, which inside a
 * sub-select that aliases `cases c` would silently resolve to the case's own
 * id and match every row. [D3]
 */
export function patientsList(opts: PatientsListOptions = {}, limit = 50) {
  const q = opts.q?.trim() ?? "";
  const conditions = [];

  if (q) {
    const term = `%${q}%`;
    conditions.push(
      sql`(${patients.fullName} like ${term} or ${patients.phone} like ${term})`,
    );
  }

  if (opts.doctorId && Number.isInteger(opts.doctorId) && opts.doctorId > 0) {
    conditions.push(sql`exists (
      select 1 from cases c
      where c.patient_id = "patients"."id" and c.doctor_id = ${opts.doctorId}
    )`);
  }

  if (opts.hasBalance) {
    // التقويم مستثنى هنا كما هو مستثنى في «الديون»: حالة تقويم قديمة ما زالت
    // تحمل إجمالياً محفوظاً كانت تُظهر صاحبها مديناً في هذه الشاشة بينما لا
    // يظهر في شاشة الديون — رقمان متناقضان عن المريض نفسه. [2026-08-19]
    conditions.push(sql`exists (
      select 1 from cases c
      join treatment_types tt on tt.id = c.treatment_type_id
      where c.patient_id = "patients"."id"
        and c.status != 'cancelled'
        and tt.settlement_bucket <> ${ORTHO_BUCKET}
        and c.total_price - coalesce(
          (select sum(p.amount) from payments p where p.case_id = c.id), 0
        ) > 0
    )`);
  }

  if (opts.visitedWithinDays && opts.visitedWithinDays > 0) {
    // «راجع» = دفع شيئاً أو حضر موعده. الموعد المحجوز وحده ليس مراجعة.
    const cutoff = shiftISOByDays(todayISO(), -opts.visitedWithinDays);
    conditions.push(sql`(
      exists (
        select 1 from payments p
        join cases c on c.id = p.case_id
        where c.patient_id = "patients"."id" and p.paid_date >= ${cutoff}
      )
      or exists (
        select 1 from appointments a
        where a.patient_id = "patients"."id"
          and a.appt_date >= ${cutoff}
          and a.status = 'came'
      )
    )`);
  }

  const base = db.select().from(patients);
  const filtered = conditions.length ? base.where(and(...conditions)) : base;
  // A search reads best alphabetically; an unfiltered list reads best newest-first.
  return filtered
    .orderBy(q ? patients.fullName : desc(patients.id))
    .limit(Math.min(200, Math.max(1, limit)))
    .all();
}

export function patientById(id: number) {
  return db.select().from(patients).where(eq(patients.id, id)).get();
}

// ── Cases ───────────────────────────────────────────────────────────────────
export interface CaseRow {
  id: number;
  patientId: number;
  patientName: string;
  /** JSON column as stored — read it with parseMedicalFlags. */
  patientMedicalFlags: string | null;
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
  // Rides along with the name so every case screen can warn without a second
  // query: the doctor must not have to open the patient file to learn he is
  // about to treat a bleeder.
  patientMedicalFlags: patients.medicalFlags,
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
 * Ortho is out: its sessions are priced and added from /ortho/[id] only, the
 * same way implants and X-rays are managed from their own screens. [2026-08-19]
 */
export function openCasesBrief(q = "", limit = 40) {
  const term = `%${q.trim()}%`;
  const collectable = sql`${cases.status} != 'cancelled' and (${cases.totalPrice} - (${paidExpr})) > 0 and ${notOrtho}`;

  return db
    .select({
      id: cases.id,
      patientName: patients.fullName,
      patientMedicalFlags: patients.medicalFlags,
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

/**
 * How many collectable cases exist, so the picker can say it is truncated.
 * Counts exactly what `openCasesBrief` would list — ortho excluded. [2026-08-19]
 */
export function collectableCaseCount(): number {
  return (
    db
      .select({ v: sql<number>`count(*)` })
      .from(cases)
      .innerJoin(treatmentTypes, eq(cases.treatmentTypeId, treatmentTypes.id))
      .where(
        sql`${cases.status} != 'cancelled' and (${cases.totalPrice} - (${paidExpr})) > 0 and ${notOrtho}`,
      )
      .get()?.v ?? 0
  );
}

// ── Appointments (السجل الرئيسي) [B1] ────────────────────────────────────────
/**
 * One day's bookings: who is expected, with which doctor, and did they come.
 *
 * The doctor/status filters run here rather than in the page: the register is
 * the busiest screen in the clinic and a day can carry every doctor at once,
 * so narrowing it in SQL keeps the filtered view as cheap as the plain one.
 * [2026-08-19]
 */
export function appointmentsForDate(
  date: string,
  filters: { doctorId?: number | null; status?: string } = {},
) {
  const conds = [eq(appointments.apptDate, date)];
  if (filters.doctorId != null) {
    conds.push(eq(appointments.doctorId, filters.doctorId));
  }
  if (isApptStatus(filters.status)) {
    conds.push(eq(appointments.status, filters.status));
  }

  return db
    .select({
      id: appointments.id,
      patientId: appointments.patientId,
      patientName: patients.fullName,
      phone: patients.phone,
      doctorId: appointments.doctorId,
      doctorName: doctors.name,
      apptDate: appointments.apptDate,
      apptTime: appointments.apptTime,
      status: appointments.status,
      note: appointments.note,
    })
    .from(appointments)
    .innerJoin(patients, eq(appointments.patientId, patients.id))
    .leftJoin(doctors, eq(appointments.doctorId, doctors.id))
    .where(and(...conds))
    .orderBy(
      sql`case when ${appointments.apptTime} is null then 1 else 0 end`,
      appointments.apptTime,
      doctors.sortOrder,
      appointments.id,
    )
    .all();
}

/**
 * One Iraq work week, inclusive. The weekly schedule keeps the same filters as
 * the day and month views, so changing its shape never broadens the result.
 */
export function appointmentsForWeek(
  startDate: string,
  filters: { doctorId?: number | null; status?: string } = {},
) {
  const endDate = shiftISOByDays(startDate, 6);
  const conds = [
    sql`${appointments.apptDate} >= ${startDate} and ${appointments.apptDate} <= ${endDate}`,
  ];
  if (filters.doctorId != null) {
    conds.push(eq(appointments.doctorId, filters.doctorId));
  }
  if (isApptStatus(filters.status)) {
    conds.push(eq(appointments.status, filters.status));
  }

  return db
    .select({
      id: appointments.id,
      patientId: appointments.patientId,
      patientName: patients.fullName,
      phone: patients.phone,
      doctorId: appointments.doctorId,
      doctorName: doctors.name,
      apptDate: appointments.apptDate,
      apptTime: appointments.apptTime,
      status: appointments.status,
      note: appointments.note,
    })
    .from(appointments)
    .innerJoin(patients, eq(appointments.patientId, patients.id))
    .leftJoin(doctors, eq(appointments.doctorId, doctors.id))
    .where(and(...conds))
    .orderBy(
      appointments.apptDate,
      sql`case when ${appointments.apptTime} is null then 1 else 0 end`,
      appointments.apptTime,
      doctors.sortOrder,
      appointments.id,
    )
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

/**
 * One row per day that has bookings in "YYYY-MM", for the month grid.
 *
 * Returned as a Map keyed by date so the grid can look a cell up without
 * scanning: a month view renders 42 cells and the clinic's laptop is slow.
 * The same doctor/status filter as the day view applies, so switching views
 * never silently widens what is being looked at. [2026-08-19]
 */
export function appointmentCountsForMonth(
  period: string,
  filters: { doctorId?: number | null; status?: string } = {},
) {
  const conds = [sql`substr(${appointments.apptDate}, 1, 7) = ${period}`];
  if (filters.doctorId != null) {
    conds.push(eq(appointments.doctorId, filters.doctorId));
  }
  if (isApptStatus(filters.status)) {
    conds.push(eq(appointments.status, filters.status));
  }

  const rows = db
    .select({
      apptDate: appointments.apptDate,
      status: appointments.status,
      n: sql<number>`count(*)`,
    })
    .from(appointments)
    .where(and(...conds))
    .groupBy(appointments.apptDate, appointments.status)
    .all();

  const byDate = new Map<
    string,
    { booked: number; came: number; noShow: number; total: number }
  >();
  for (const r of rows) {
    const cell =
      byDate.get(r.apptDate) ?? { booked: 0, came: 0, noShow: 0, total: 0 };
    if (r.status === "booked") cell.booked += r.n;
    else if (r.status === "came") cell.came += r.n;
    else if (r.status === "no_show") cell.noShow += r.n;
    cell.total += r.n;
    byDate.set(r.apptDate, cell);
  }
  return byDate;
}

/** One appointment by id — the rebook action copies patient/doctor from it. */
export function appointmentById(id: number) {
  return db
    .select({
      id: appointments.id,
      patientId: appointments.patientId,
      doctorId: appointments.doctorId,
      apptDate: appointments.apptDate,
      apptTime: appointments.apptTime,
      status: appointments.status,
      note: appointments.note,
    })
    .from(appointments)
    .where(eq(appointments.id, id))
    .get();
}

/**
 * The next still-booked appointments from `fromDate` onward.
 *
 * Only "booked" — a past-dated visit already marked حضر is history, and the
 * point of this list is what the clinic still has to prepare for.
 */
export function upcomingAppointments(fromDate: string, limit = 8) {
  return db
    .select({
      id: appointments.id,
      patientId: appointments.patientId,
      patientName: patients.fullName,
      phone: patients.phone,
      doctorName: doctors.name,
      apptDate: appointments.apptDate,
      note: appointments.note,
    })
    .from(appointments)
    .innerJoin(patients, eq(appointments.patientId, patients.id))
    .leftJoin(doctors, eq(appointments.doctorId, doctors.id))
    .where(
      and(
        sql`${appointments.apptDate} > ${fromDate}`,
        eq(appointments.status, "booked"),
      ),
    )
    .orderBy(appointments.apptDate, appointments.id)
    .limit(Math.min(50, Math.max(1, limit)))
    .all();
}

// ── Debts call-list (سجل الديون) ─────────────────────────────────────────────
/**
 * Outstanding balances for the call-list. Phone and last-payment date are
 * correlated sub-selects rather than a query per row (was 2N+1). [D6]
 * Ortho never appears here: there is no agreed total to owe. [2026-08-19]
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
    .where(
      sql`(${cases.totalPrice} - (${paidExpr})) > 0 and ${cases.status} != 'cancelled' and ${notOrtho}`,
    )
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
      String(r.implantCardNo ?? "").includes(term),
  );
}

// ── Ortho register (سجل التقويم) ─────────────────────────────────────────────
/**
 * سجل التقويم — مقدمة ومدفوع، بلا إجمالي ولا متبقٍ. [2026-08-19]
 *
 * The register shows the two numbers that exist for an open-ended ortho case:
 * what was taken up front, and what the case has collected in total since. The
 * down payment is a correlated sub-select for the same reason `paid` is — one
 * query for the whole list, never one per row. [D6]
 */
export function orthoCases(q = "") {
  const rows = db
    .select({
      ...caseSelect,
      // المدفوع من المقدمة — والمقدمة المتفق عليها بجانبه: المقدمة تُحدَّد مرة
      // وتُسدَّد على دفعات، فالرقمان مختلفان دائماً حتى تكتمل. [2026-08-25]
      downPayment: sql<number>`coalesce((
        select sum(p.amount) from payments p
        where p.case_id = cases.id and p.kind = 'down_payment'
      ), 0)`,
      downPaymentAgreed: cases.downPaymentAgreed,
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

// ── X-rays (سجل الأشعة) [D9] ─────────────────────────────────────────────────
/** أنواع الأشعة المُفعّلة — تملأ قائمة «نوع الأشعة» في النموذج. */
export function listXrayTreatmentTypes() {
  return listTreatmentTypes().filter((t) => t.settlementBucket === XRAY_BUCKET);
}

/**
 * X-ray cash received in a period. This is the clinic's own income line: it is
 * summed here and nowhere inside the per-doctor settlement. [D9]
 *
 * مصدران يُجمعان عمداً: الأفلام الجديدة (`xray_films`، مدفوعة بتاريخها) وأي
 * دفعات على حالات أشعة قديمة سُجِّلت قبل 2026-08-25. لو قُرئ أحدهما وحده لظهر
 * الصندوق ناقصاً أو الحصيلة كاذبة في شهر فيه الاثنان.
 */
export function xrayIncomeForPeriod(period: string): number {
  const legacy =
    db
      .select({ v: sql<number>`coalesce(sum(${payments.amount}), 0)` })
      .from(payments)
      .innerJoin(cases, eq(payments.caseId, cases.id))
      .innerJoin(treatmentTypes, eq(cases.treatmentTypeId, treatmentTypes.id))
      .where(
        and(
          eq(treatmentTypes.settlementBucket, XRAY_BUCKET),
          sql`substr(${payments.paidDate}, 1, 7) = ${period}`,
        ),
      )
      .get()?.v ?? 0;
  return legacy + xrayFilmIncomeForPeriod(period);
}

/** دخل الأفلام في شهر — الفيلم مدفوع بالكامل بتاريخه، فسعره هو دخله. */
export function xrayFilmIncomeForPeriod(period: string): number {
  return (
    db
      .select({ v: sql<number>`coalesce(sum(${xrayFilms.price}), 0)` })
      .from(xrayFilms)
      .where(sql`substr(${xrayFilms.filmDate}, 1, 7) = ${period}`)
      .get()?.v ?? 0
  );
}

/** أفلام يوم واحد — للدفتر اليومي، حتى يطابق إجمالي اليوم ما في الصندوق. */
export function xrayFilmsForDate(date: string) {
  return db
    .select({
      id: xrayFilms.id,
      filmDate: xrayFilms.filmDate,
      placement: xrayFilms.placement,
      price: xrayFilms.price,
      treatment: treatmentTypes.nameAr,
    })
    .from(xrayFilms)
    .innerJoin(treatmentTypes, eq(xrayFilms.treatmentTypeId, treatmentTypes.id))
    .where(eq(xrayFilms.filmDate, date))
    .orderBy(desc(xrayFilms.id))
    .all();
}

/**
 * شهر واحد من الأفلام: الصور المسجَّلة ودخلها، مقسومة على النوع وعلى
 * داخل/خارج. لا «متبقٍ» هنا: الفيلم مدفوع بتاريخه. [قرار العيادة 2026-08-25]
 */
export function xrayFilmsForMonth(period: string) {
  const inPeriod = sql`substr(${xrayFilms.filmDate}, 1, 7) = ${period}`;

  const rows = db
    .select({
      id: xrayFilms.id,
      filmDate: xrayFilms.filmDate,
      placement: xrayFilms.placement,
      price: xrayFilms.price,
      treatment: treatmentTypes.nameAr,
      treatmentKey: treatmentTypes.key,
    })
    .from(xrayFilms)
    .innerJoin(treatmentTypes, eq(xrayFilms.treatmentTypeId, treatmentTypes.id))
    .where(inPeriod)
    .orderBy(desc(xrayFilms.filmDate), desc(xrayFilms.id))
    .all();

  const byType = db
    .select({
      key: treatmentTypes.key,
      nameAr: treatmentTypes.nameAr,
      count: sql<number>`count(*)`,
      billed: sql<number>`coalesce(sum(${xrayFilms.price}), 0)`,
    })
    .from(xrayFilms)
    .innerJoin(treatmentTypes, eq(xrayFilms.treatmentTypeId, treatmentTypes.id))
    .where(inPeriod)
    .groupBy(treatmentTypes.id)
    .orderBy(treatmentTypes.sortOrder)
    .all();

  const internal = rows
    .filter((r) => r.placement === "internal")
    .reduce((s, r) => s + r.price, 0);
  const external = rows
    .filter((r) => r.placement === "external")
    .reduce((s, r) => s + r.price, 0);

  return {
    rows,
    byType,
    count: rows.length,
    internal,
    external,
    /** دخل الشهر كله — الأفلام وحدها؛ الحصيلة تضيف إليها القديم إن وُجد. */
    income: internal + external,
  };
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

  // «تحصيل اليوم/الشهر» = ما دخل الصندوق فعلاً، والفيلم منه: هو نقد بلا سطر
  // دفعة. لولا جمعه هنا لاختلف مجموع الشاشة عن «النقد المتوفر» فوقها مباشرة،
  // ولنقص سطر الأشعة أسفلها من مجموعه. [قرار العيادة 2026-08-25][D9]
  const todayCollected =
    (db.select({ v: sql<number>`coalesce(sum(${payments.amount}),0)` }).from(payments).where(eq(payments.paidDate, today)).get()?.v ?? 0) +
    (db.select({ v: sql<number>`coalesce(sum(${xrayFilms.price}),0)` }).from(xrayFilms).where(eq(xrayFilms.filmDate, today)).get()?.v ?? 0);
  const monthCollected =
    (db.select({ v: sql<number>`coalesce(sum(${payments.amount}),0)` }).from(payments).where(monthFilter).get()?.v ?? 0) +
    xrayFilmIncomeForPeriod(period);
  const monthExpenses =
    db.select({ v: sql<number>`coalesce(sum(${expenses.amount}),0)` }).from(expenses).where(sql`substr(${expenses.expenseDate},1,7) = ${period}`).get()?.v ?? 0;
  // نفس استثناء التقويم المطبَّق في «الديون» — الرقمان يجب أن يتطابقا. [2026-08-19]
  const outstanding =
    db
      .select({ v: sql<number>`coalesce(sum(${cases.totalPrice} - (${paidExpr})),0)` })
      .from(cases)
      .innerJoin(treatmentTypes, eq(cases.treatmentTypeId, treatmentTypes.id))
      .where(
        sql`(${cases.totalPrice} - (${paidExpr})) > 0 and ${cases.status} != 'cancelled' and ${notOrtho}`,
      )
      .get()?.v ?? 0;
  const openImplants =
    db.select({ v: sql<number>`count(*)` }).from(cases).innerJoin(treatmentTypes, eq(cases.treatmentTypeId, treatmentTypes.id)).where(and(eq(treatmentTypes.isImplant, true), eq(cases.status, "open"))).get()?.v ?? 0;

  // X-ray money is the clinic's, so it is lifted out of the per-doctor rows and
  // shown on its own line. [D9]
  const monthXray = xrayIncomeForPeriod(period);

  // Net of refunds (stored negative). These rows carry exactly what the
  // settlement screen credits to each doctor, so the two screens always agree;
  // together with the X-ray line they still add up to monthCollected. [A7][D9]
  const perDoctorMonth = db
    .select({
      doctorId: doctors.id,
      doctorName: doctors.name,
      // "doctors"."id" is written out rather than interpolated: a single-table
      // select renders an interpolated column as a bare `id`, which is
      // ambiguous once this subquery joins three tables of its own.
      collected: sql<number>`coalesce((
        select sum(p.amount) from payments p
        join cases c on c.id = p.case_id
        join treatment_types t on t.id = c.treatment_type_id
        where p.doctor_id = "doctors"."id"
          and substr(p.paid_date, 1, 7) = ${period}
          and t.settlement_bucket <> ${XRAY_BUCKET}
      ), 0)`,
    })
    .from(doctors)
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
    monthXray,
    monthExpenses,
    outstanding,
    openImplants,
    apptToday,
    perDoctorMonth,
  };
}

// ── الأطباء + مستحقات المختبر ────────────────────────────────────────────────
/** One doctor by id, for the doctor page. */
export function doctorById(id: number) {
  return db.select().from(doctors).where(eq(doctors.id, id)).get();
}

/**
 * A doctor's lab entries in a period, newest first, with the patient name when
 * the entry was tied to one.
 */
export function labEntriesForDoctor(doctorId: number, period: string) {
  return db
    .select({
      id: labEntries.id,
      branch: labEntries.branch,
      entryDate: labEntries.entryDate,
      amount: labEntries.amount,
      note: labEntries.note,
      patientId: labEntries.patientId,
      patientName: patients.fullName,
    })
    .from(labEntries)
    .leftJoin(patients, eq(labEntries.patientId, patients.id))
    .where(
      and(
        eq(labEntries.doctorId, doctorId),
        sql`substr(${labEntries.entryDate}, 1, 7) = ${period}`,
      ),
    )
    .orderBy(desc(labEntries.entryDate), desc(labEntries.id))
    .all();
}

/**
 * Lab totals per doctor for a period, split by branch.
 *
 * Reported beside the settlement but never inside it: this is tracking, not
 * payout. [قرار العيادة 2026-08-19]
 */
export function labDuesForPeriod(period: string) {
  const rows = db
    .select({
      doctorId: labEntries.doctorId,
      branch: labEntries.branch,
      total: sql<number>`coalesce(sum(${labEntries.amount}), 0)`,
    })
    .from(labEntries)
    .where(sql`substr(${labEntries.entryDate}, 1, 7) = ${period}`)
    .groupBy(labEntries.doctorId, labEntries.branch)
    .all();

  const byDoctor = new Map<number, { fixed: number; mobile: number; total: number }>();
  for (const r of rows) {
    const cell = byDoctor.get(r.doctorId) ?? { fixed: 0, mobile: 0, total: 0 };
    if (r.branch === "fixed") cell.fixed += r.total;
    else cell.mobile += r.total;
    cell.total += r.total;
    byDoctor.set(r.doctorId, cell);
  }
  return byDoctor;
}

/**
 * كل قيود المختبر في الشهر — لكل الأطباء، بأسمائهم.
 *
 * المالك (د. عدي) هو من يمسك دفتر المختبرات كلها: مختبر كل طبيب حسابه الخاص،
 * لكن المجموع كلّه يُقرأ من مكان واحد. تُقرأ في ملفه وحده، ولا تدخل صرفيات
 * العيادة ولا أي حساب من حساباتها. [قرار العيادة 2026-08-25]
 */
export function labEntriesForPeriod(period: string) {
  return db
    .select({
      id: labEntries.id,
      doctorId: labEntries.doctorId,
      doctorName: doctors.name,
      labName: doctors.labName,
      branch: labEntries.branch,
      entryDate: labEntries.entryDate,
      amount: labEntries.amount,
      note: labEntries.note,
      patientName: patients.fullName,
    })
    .from(labEntries)
    .innerJoin(doctors, eq(labEntries.doctorId, doctors.id))
    .leftJoin(patients, eq(labEntries.patientId, patients.id))
    .where(sql`substr(${labEntries.entryDate}, 1, 7) = ${period}`)
    .orderBy(desc(labEntries.entryDate), desc(labEntries.id))
    .all();
}

/** Grand total of lab dues in a period — the one info line on the settlement. */
export function labDuesTotal(period: string): number {
  return (
    db
      .select({ v: sql<number>`coalesce(sum(${labEntries.amount}), 0)` })
      .from(labEntries)
      .where(sql`substr(${labEntries.entryDate}, 1, 7) = ${period}`)
      .get()?.v ?? 0
  );
}


// ── Case teeth (مخطط الأسنان) ───────────────────────────────────────────────

export interface ToothMark {
  id: number;
  scope: "tooth" | "arch" | "mouth";
  toothCode: number | null;
  arch: "upper" | "lower" | null;
  surfaces: Surface[] | null;
  spanId: number | null;
  spanRole: "abutment" | "pontic" | null;
  note: string | null;
}

function parseSurfaces(json: string | null): Surface[] | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as Surface[]) : null;
  } catch {
    // A hand-edited DB file should degrade to "whole tooth", never crash the
    // chart — this app runs unattended on a clinic laptop with no error console.
    return null;
  }
}

function toMark(r: typeof caseTeeth.$inferSelect): ToothMark {
  return {
    id: r.id,
    scope: r.scope,
    toothCode: r.toothCode,
    arch: r.arch,
    surfaces: parseSurfaces(r.surfaces),
    spanId: r.spanId,
    spanRole: r.spanRole,
    note: r.note,
  };
}

export function teethForCase(caseId: number): ToothMark[] {
  return db.select().from(caseTeeth).where(eq(caseTeeth.caseId, caseId)).all().map(toMark);
}

export interface PatientToothEvent extends ToothMark {
  caseId: number;
  openedDate: string;
  treatmentAr: string;
  treatmentKey: string;
  doctorName: string;
  caseStatus: string;
}

/**
 * Every tooth mark this patient has ever received, newest first.
 *
 * This is the query the whole feature exists for: today the tooth is prose
 * inside a note, so "what has been done to this patient's tooth 16?" cannot be
 * asked at all. Grouping this by `toothCode` gives the accumulated odontogram
 * without storing a second copy of the state — the per-case rows stay the only
 * source of truth. (Spec §7 Q6.)
 */
export function patientToothHistory(patientId: number): PatientToothEvent[] {
  return db
    .select({
      r: caseTeeth,
      caseId: cases.id,
      openedDate: cases.openedDate,
      caseStatus: cases.status,
      treatmentAr: treatmentTypes.nameAr,
      treatmentKey: treatmentTypes.key,
      doctorName: doctors.name,
    })
    .from(caseTeeth)
    .innerJoin(cases, eq(caseTeeth.caseId, cases.id))
    .innerJoin(treatmentTypes, eq(cases.treatmentTypeId, treatmentTypes.id))
    .innerJoin(doctors, eq(cases.doctorId, doctors.id))
    .where(eq(cases.patientId, patientId))
    .orderBy(desc(cases.openedDate), desc(caseTeeth.id))
    .all()
    .map((row) => ({
      ...toMark(row.r),
      caseId: row.caseId,
      openedDate: row.openedDate,
      caseStatus: row.caseStatus,
      treatmentAr: row.treatmentAr,
      treatmentKey: row.treatmentKey,
      doctorName: row.doctorName,
    }));
}

/** Accumulated per-tooth history, keyed by FDI code. Arch/mouth marks excluded. */
export function patientToothMap(patientId: number): Map<number, PatientToothEvent[]> {
  const out = new Map<number, PatientToothEvent[]>();
  for (const e of patientToothHistory(patientId)) {
    if (e.scope !== "tooth" || e.toothCode === null) continue;
    if (!getTooth(e.toothCode)) continue; // ignore codes a hand-edited DB invented
    const list = out.get(e.toothCode);
    if (list) list.push(e);
    else out.set(e.toothCode, [e]);
  }
  return out;
}
