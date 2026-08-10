import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, sqlite } from "@/lib/db";
import {
  patients,
  cases,
  payments,
  appointments,
  cashMovements,
  treatmentTypes,
  expenses,
  settings,
  doctors,
  priceList,
} from "@/lib/db/schema";
import { recordEdit, nextCounter } from "@/lib/server-utils";
import { isValidISODate, monthOf } from "@/lib/dates";

function atomicMutation<TArgs extends unknown[], TResult>(
  mutation: (...args: TArgs) => TResult,
): (...args: TArgs) => TResult {
  return sqlite.transaction(mutation) as unknown as (...args: TArgs) => TResult;
}

// ── Patients ────────────────────────────────────────────────────────────────
export const createPatient = atomicMutation((input: {
  fullName: string;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
}): number => {
  const res = db
    .insert(patients)
    .values({
      fullName: input.fullName.trim(),
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .run();
  const id = Number(res.lastInsertRowid);
  recordEdit({ entity: "patients", entityId: id, action: "insert", after: input });
  return id;
});

export const updatePatient = atomicMutation((
  id: number,
  fields: Partial<{ fullName: string; phone: string | null; address: string | null; notes: string | null }>,
): void => {
  const before = db.select().from(patients).where(eq(patients.id, id)).get();
  db.update(patients).set(fields).where(eq(patients.id, id)).run();
  recordEdit({ entity: "patients", entityId: id, action: "update", before, after: fields });
});

/** Match only an explicit exact name+phone identity; blank phones always create. */
export const findOrCreatePatient = atomicMutation((input: {
  fullName: string;
  phone?: string | null;
  address?: string | null;
}): number => {
  const name = input.fullName.trim();
  const phone = input.phone?.trim() || null;
  if (phone) {
    const existing = db
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.fullName, name), eq(patients.phone, phone)))
      .get();
    if (existing) return existing.id;
  }
  return createPatient(input);
});

// ── Cases ───────────────────────────────────────────────────────────────────
export interface NewCaseInput {
  patientId: number;
  doctorId: number;
  treatmentTypeId: number;
  openedDate: string; // YYYY-MM-DD
  listPrice: number;
  discount: number;
  totalPrice: number;
  device?: string | null;
  address?: string | null;
  labCost?: number;
  notes?: string | null;
}

export type TreatmentCourse = "implant" | "ortho" | "ordinary";

function treatmentCourse(treatmentTypeId: number): TreatmentCourse | null {
  const type = db
    .select({ isImplant: treatmentTypes.isImplant, isOrtho: treatmentTypes.isOrtho })
    .from(treatmentTypes)
    .where(eq(treatmentTypes.id, treatmentTypeId))
    .get();
  if (!type) return null;
  if (type.isImplant) return "implant";
  if (type.isOrtho) return "ortho";
  return "ordinary";
}

/** Create a case; allocate implant card + account numbers if it's an implant. */
export const createCase = atomicMutation((input: NewCaseInput): number => {
  const tt = db.select().from(treatmentTypes).where(eq(treatmentTypes.id, input.treatmentTypeId)).get();
  let implantCardNo: number | null = null;
  let accountSeqNo: number | null = null;
  if (tt?.isImplant) {
    implantCardNo = nextCounter("implant_card_no");
    accountSeqNo = nextCounter("account_seq_no");
  }
  const res = db
    .insert(cases)
    .values({
      patientId: input.patientId,
      doctorId: input.doctorId,
      treatmentTypeId: input.treatmentTypeId,
      openedDate: input.openedDate,
      listPrice: input.listPrice,
      discount: input.discount,
      totalPrice: input.totalPrice,
      labCost: input.labCost ?? 0,
      device: input.device ?? null,
      addressSnapshot: input.address ?? null,
      notes: input.notes ?? null,
      implantCardNo,
      accountSeqNo,
    })
    .run();
  const id = Number(res.lastInsertRowid);
  recordEdit({ entity: "cases", entityId: id, action: "insert", after: input, period: monthOf(input.openedDate) });
  return id;
});

export const updateCaseMeta = atomicMutation((
  caseId: number,
  fields: Partial<{
    status: "open" | "completed" | "cancelled";
    listPrice: number;
    discount: number;
    totalPrice: number;
    device: string | null;
    addressSnapshot: string | null;
    labCost: number;
    hasComplaint: boolean;
    complaintNote: string | null;
    nextAppointment: string | null;
    notes: string | null;
  }>,
  expectedCourse?: TreatmentCourse,
): boolean => {
  const before = db.select().from(cases).where(eq(cases.id, caseId)).get();
  if (!before) return false;
  if (expectedCourse && treatmentCourse(before.treatmentTypeId) !== expectedCourse) {
    return false;
  }
  if (fields.totalPrice !== undefined) {
    const paid =
      db
        .select({ value: sql<number>`coalesce(sum(${payments.amount}), 0)` })
        .from(payments)
        .where(eq(payments.caseId, caseId))
        .get()?.value ?? 0;
    if (fields.totalPrice < Math.max(0, paid)) return false;
  }
  db.update(cases).set({ ...fields, updatedAt: Date.now() }).where(eq(cases.id, caseId)).run();
  recordEdit({
    entity: "cases",
    entityId: caseId,
    action: "update",
    before,
    after: fields,
    period: before ? monthOf(before.openedDate) : undefined,
  });
  return true;
});

// ── Payments ────────────────────────────────────────────────────────────────
export interface NewPaymentInput {
  caseId: number;
  amount: number;
  kind?: "down_payment" | "session" | "refund" | "adjustment";
  paidDate: string;
  note?: string | null;
  expectedCourse?: TreatmentCourse;
}

export type PaymentFailure =
  | "not_found"
  | "case_cancelled"
  | "invalid_amount"
  | "invalid_date"
  | "wrong_course"
  | "exceeds_remaining"
  | "refund_exceeds_paid";

export type PaymentResult =
  | { ok: true; paymentId: number; amount: number; remaining: number }
  | { ok: false; reason: PaymentFailure };

export function paymentFailureMessage(reason: PaymentFailure): string {
  const messages = {
    not_found: "لم يتم العثور على الحالة.",
    case_cancelled: "لا يمكن تسجيل دفعة على حالة ملغاة.",
    invalid_amount: "أدخل مبلغاً صحيحاً أكبر من صفر.",
    invalid_date: "التاريخ غير صحيح.",
    wrong_course: "الحالة لا تنتمي إلى سجل العلاج المطلوب.",
    exceeds_remaining: "المبلغ أكبر من الرصيد المتبقي.",
    refund_exceeds_paid: "مبلغ الاسترجاع أكبر من صافي المبالغ المدفوعة.",
  } satisfies Record<PaymentFailure, string>;
  return messages[reason];
}

function insertPayment(
  input: NewPaymentInput & { doctorId: number },
  amount: number,
): number {
  const res = db
    .insert(payments)
    .values({
      caseId: input.caseId,
      doctorId: input.doctorId,
      amount,
      kind: input.kind ?? "session",
      paidDate: input.paidDate,
      note: input.note ?? null,
    })
    .run();
  const id = Number(res.lastInsertRowid);
  recordEdit({
    entity: "payments",
    entityId: id,
    action: "insert",
    after: {
      caseId: input.caseId,
      doctorId: input.doctorId,
      amount,
      kind: input.kind ?? "session",
      paidDate: input.paidDate,
      note: input.note ?? null,
    },
    period: monthOf(input.paidDate),
  });
  return id;
}

/**
 * Record one collection/refund with all case invariants inside one transaction.
 * The credited doctor is always derived from the case, never from form input.
 */
export const recordCasePayment = sqlite.transaction(
  (input: NewPaymentInput): PaymentResult => {
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
      return { ok: false, reason: "invalid_amount" };
    }
    if (!isValidISODate(input.paidDate)) {
      return { ok: false, reason: "invalid_date" };
    }

    const treatmentCase = db.select().from(cases).where(eq(cases.id, input.caseId)).get();
    if (!treatmentCase) return { ok: false, reason: "not_found" };
    if (
      input.expectedCourse &&
      treatmentCourse(treatmentCase.treatmentTypeId) !== input.expectedCourse
    ) {
      return { ok: false, reason: "wrong_course" };
    }

    const paid =
      db
        .select({ value: sql<number>`coalesce(sum(${payments.amount}), 0)` })
        .from(payments)
        .where(eq(payments.caseId, input.caseId))
        .get()?.value ?? 0;
    const kind = input.kind ?? "session";

    if (kind === "refund") {
      if (input.amount > Math.max(0, paid)) {
        return { ok: false, reason: "refund_exceeds_paid" };
      }
    } else {
      // A finished treatment can still carry a balance the clinic is chasing —
      // "completed" means the dental work is done, not that the account is
      // settled. Only a cancelled case refuses money. [A4]
      if (treatmentCase.status === "cancelled") {
        return { ok: false, reason: "case_cancelled" };
      }
      if (input.amount > Math.max(0, treatmentCase.totalPrice - paid)) {
        return { ok: false, reason: "exceeds_remaining" };
      }
    }

    const amount = kind === "refund" ? -input.amount : input.amount;
    const paymentId = insertPayment(
      { ...input, doctorId: treatmentCase.doctorId, kind },
      amount,
    );
    return {
      ok: true,
      paymentId,
      amount,
      remaining: treatmentCase.totalPrice - (paid + amount),
    };
  },
) as unknown as (input: NewPaymentInput) => PaymentResult;

/**
 * Remove a mis-entered payment line. This is the ONLY clean correction path:
 * a refund is a real event that nets against the doctor's commissionable base,
 * so it must not be used to undo a typo. The deleted row survives in full in
 * the audit log, and a closed period is marked stale. [A1]
 */
export const deletePayment = atomicMutation((id: number): boolean => {
  const before = db.select().from(payments).where(eq(payments.id, id)).get();
  if (!before) return false;
  db.delete(payments).where(eq(payments.id, id)).run();
  recordEdit({
    entity: "payments",
    entityId: id,
    action: "delete",
    before,
    period: monthOf(before.paidDate),
    note: "payment voided",
  });
  return true;
});

/** Open a case and record its first payment atomically. */
export const createCaseWithPayment = sqlite.transaction(
  (input: NewCaseInput & { firstPayment?: { amount: number; kind?: NewPaymentInput["kind"]; note?: string | null } }) => {
    if (input.firstPayment) {
      const kind = input.firstPayment.kind ?? "down_payment";
      if (
        kind === "refund" ||
        !Number.isSafeInteger(input.firstPayment.amount) ||
        input.firstPayment.amount < 0 ||
        input.firstPayment.amount > input.totalPrice
      ) {
        throw new Error("Initial payment violates the case balance");
      }
    }
    const caseId = createCase(input);
    let paymentId: number | null = null;
    if (input.firstPayment && input.firstPayment.amount !== 0) {
      paymentId = insertPayment(
        {
          caseId,
          doctorId: input.doctorId,
          amount: input.firstPayment.amount,
          kind: input.firstPayment.kind ?? "down_payment",
          paidDate: input.openedDate,
          note: input.firstPayment.note ?? null,
        },
        input.firstPayment.amount,
      );
    }
    return { caseId, paymentId };
  },
) as unknown as (
  input: NewCaseInput & { firstPayment?: { amount: number; kind?: NewPaymentInput["kind"]; note?: string | null } },
) => { caseId: number; paymentId: number | null };

// ── Appointments (السجل الرئيسي: اسم المراجع + موعده) [B1] ────────────────────
// Deliberately holds NO clinical detail — the clinic was explicit that this
// register is only "اسم المراجع وعلياته بيجاي". Money lives on the case.

export type AppointmentStatus = "booked" | "came" | "no_show";

export const createAppointment = atomicMutation((input: {
  patientId: number;
  doctorId?: number | null;
  apptDate: string; // YYYY-MM-DD
  note?: string | null;
}): number => {
  const res = db
    .insert(appointments)
    .values({
      patientId: input.patientId,
      doctorId: input.doctorId ?? null,
      apptDate: input.apptDate,
      note: input.note?.trim() || null,
    })
    .run();
  const id = Number(res.lastInsertRowid);
  recordEdit({ entity: "appointments", entityId: id, action: "insert", after: input });
  return id;
});

/** Mark حضر / لم يحضر — the whole point of the register. */
export const setAppointmentStatus = atomicMutation((
  id: number,
  status: AppointmentStatus,
): boolean => {
  const before = db.select().from(appointments).where(eq(appointments.id, id)).get();
  if (!before) return false;
  db.update(appointments).set({ status }).where(eq(appointments.id, id)).run();
  recordEdit({
    entity: "appointments",
    entityId: id,
    action: "update",
    before,
    after: { status },
  });
  return true;
});

export const deleteAppointment = atomicMutation((id: number): boolean => {
  const before = db.select().from(appointments).where(eq(appointments.id, id)).get();
  if (!before) return false;
  db.delete(appointments).where(eq(appointments.id, id)).run();
  recordEdit({ entity: "appointments", entityId: id, action: "delete", before });
  return true;
});

// ── Cash movements (reserves / withdrawals / payouts / owner draws) [D8] ─────
export const recordCashMovement = atomicMutation((input: {
  moveDate: string;
  type: "reserve" | "withdrawal" | "owner_draw" | "payout" | "adjustment";
  amount: number; // signed: inflow +, outflow −
  note?: string | null;
  refTable?: string | null;
  refId?: number | null;
}): number => {
  const res = db
    .insert(cashMovements)
    .values({
      moveDate: input.moveDate,
      type: input.type,
      amount: input.amount,
      note: input.note ?? null,
      refTable: input.refTable ?? null,
      refId: input.refId ?? null,
    })
    .run();
  const id = Number(res.lastInsertRowid);
  recordEdit({ entity: "cash_movements", entityId: id, action: "insert", after: input });
  return id;
});

// ── Expenses (سجل الصرفيات) — period-aware so closed-month edits go stale [D4] ─
export const addExpense = atomicMutation((input: {
  expenseDate: string;
  category: "food" | "water" | "dental_materials" | "dental_lab" | "installments" | "other";
  amount: number;
  note?: string | null;
}): number => {
  const res = db
    .insert(expenses)
    .values({
      expenseDate: input.expenseDate,
      category: input.category,
      amount: input.amount,
      note: input.note ?? null,
    })
    .run();
  const id = Number(res.lastInsertRowid);
  recordEdit({
    entity: "expenses",
    entityId: id,
    action: "insert",
    after: input,
    period: monthOf(input.expenseDate),
  });
  return id;
});

export const deleteExpense = atomicMutation((id: number): void => {
  const before = db.select().from(expenses).where(eq(expenses.id, id)).get();
  if (!before) return;
  db.delete(expenses).where(eq(expenses.id, id)).run();
  recordEdit({
    entity: "expenses",
    entityId: id,
    action: "delete",
    before,
    period: monthOf(before.expenseDate),
  });
});

// ── Config writes (settings / doctors / prices) ─────────────────────────────
export const updateSettings = atomicMutation((
  fields: Partial<{
    clinicName: string;
    openingCashBalance: number;
    cashReserveThreshold: number;
    labDeductedPerDoctor: boolean;
    pctAppliedAfterLab: boolean;
    defaultCommissionPct: number;
    staffSalaryMode: string;
    pinHash: string;
  }>,
): void => {
  db.update(settings).set({ ...fields, updatedAt: Date.now() }).where(eq(settings.id, 1)).run();
  // Never log the PIN hash.
  const safe = { ...fields };
  delete safe.pinHash;
  recordEdit({ entity: "settings", entityId: 1, action: "update", after: safe });
});

export const updateDoctor = atomicMutation((
  id: number,
  fields: Partial<{ name: string; commissionPct: number | null; isActive: boolean; doesOrtho: boolean }>,
): void => {
  const before = db.select().from(doctors).where(eq(doctors.id, id)).get();
  db.update(doctors).set(fields).where(eq(doctors.id, id)).run();
  recordEdit({ entity: "doctors", entityId: id, action: "update", before, after: fields });
});

export const setPrice = atomicMutation((treatmentTypeId: number, price: number): void => {
  const existing = db.select().from(priceList).where(eq(priceList.treatmentTypeId, treatmentTypeId)).get();
  if (existing) {
    db.update(priceList)
      .set({ defaultPrice: price, isPlaceholder: false, updatedAt: Date.now() })
      .where(eq(priceList.treatmentTypeId, treatmentTypeId))
      .run();
  } else {
    db.insert(priceList).values({ treatmentTypeId, defaultPrice: price, isPlaceholder: false }).run();
  }
  recordEdit({ entity: "price_list", entityId: treatmentTypeId, action: "update", after: { price } });
});
