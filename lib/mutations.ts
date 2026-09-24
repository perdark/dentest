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
  auditLog,
  counters,
  monthlySettlements,
  labEntries,
  xrayFilms,
  caseTeeth,
} from "@/lib/db/schema";
import { isValidToothCode, type Surface } from "@/lib/db/teeth";
import { recordEdit, nextCounter } from "@/lib/server-utils";
import { isValidISODate, isRecordableDate, monthOf } from "@/lib/dates";
import { ORTHO_BUCKET, XRAY_BUCKET } from "@/lib/strings";

function atomicMutation<TArgs extends unknown[], TResult>(
  mutation: (...args: TArgs) => TResult,
): (...args: TArgs) => TResult {
  return sqlite.transaction(mutation) as unknown as (...args: TArgs) => TResult;
}

// ── Patients ────────────────────────────────────────────────────────────────
/**
 * The chronic-condition flags as the column stores them.
 *
 * An empty tick-list is stored as NULL, not as `[]`: "nothing recorded" and
 * "asked and clear" are the same thing to the clinic, and one representation
 * keeps every reader (chips, warnings, filters) on a single check.
 */
function serializeMedicalFlags(flags: string[] | undefined): string | null {
  return flags && flags.length > 0 ? JSON.stringify(flags) : null;
}

export const createPatient = atomicMutation((input: {
  fullName: string;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  medicalFlags?: string[];
  medicalNotes?: string | null;
  doctorId?: number | null;
}): number => {
  const res = db
    .insert(patients)
    .values({
      fullName: input.fullName.trim(),
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      notes: input.notes?.trim() || null,
      medicalFlags: serializeMedicalFlags(input.medicalFlags),
      medicalNotes: input.medicalNotes?.trim() || null,
      doctorId: input.doctorId ?? null,
    })
    .run();
  const id = Number(res.lastInsertRowid);
  recordEdit({ entity: "patients", entityId: id, action: "insert", after: input });
  return id;
});

export const updatePatient = atomicMutation((
  id: number,
  fields: Partial<{
    fullName: string;
    phone: string | null;
    address: string | null;
    notes: string | null;
    medicalFlags: string[];
    medicalNotes: string | null;
    doctorId: number | null;
  }>,
): void => {
  const before = db.select().from(patients).where(eq(patients.id, id)).get();
  const { medicalFlags, ...rest } = fields;
  db.update(patients)
    .set(
      medicalFlags === undefined
        ? rest
        : { ...rest, medicalFlags: serializeMedicalFlags(medicalFlags) },
    )
    .where(eq(patients.id, id))
    .run();
  recordEdit({ entity: "patients", entityId: id, action: "update", before, after: fields });
});

/**
 * Match only an explicit exact name+phone identity; blank phones always create.
 *
 * The medical fields ride along only when a new record is created. A quick
 * walk-in form must never quietly overwrite the health history someone already
 * took the time to fill in on the patient's file.
 */
export const findOrCreatePatient = atomicMutation((input: {
  fullName: string;
  phone?: string | null;
  address?: string | null;
  medicalFlags?: string[];
  medicalNotes?: string | null;
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

// ── Treatment types ─────────────────────────────────────────────────────────
/**
 * أنواع العلاج تُكتب باليد في الدفتر اليومي (قرار العيادة 2026-08-19).
 *
 * الاسم الذي تكتبه السكرتيرة إمّا يطابق نوعاً موجوداً فيُستعمل، أو يكون جديداً
 * فيُضاف إلى القائمة ويُقترح في المرات القادمة. لا قائمة مغلقة يديرها أحد.
 *
 * The guard that makes this safe is the bucket: only a `normal` type can be
 * reached or created this way. Typing a name that already belongs to an
 * implant / ortho / X-ray type is refused with the same message the closed
 * select used to make impossible, so free text can never clone a specially
 * settled treatment into the normal bucket and bypass D9.
 */
export type TreatmentTypeFailure =
  | "empty_name"
  | "implant_record"
  | "ortho_record"
  | "xray_record";

export type TreatmentTypeResult =
  | { ok: true; id: number; created: boolean }
  | { ok: false; reason: TreatmentTypeFailure };

export function treatmentTypeFailureMessage(reason: TreatmentTypeFailure): string {
  const messages = {
    empty_name: "اكتب اسم العلاج",
    implant_record: "تُفتح حالات الزراعة من سجل الزراعة لإكمال بيانات البطاقة",
    ortho_record: "تُفتح حالات التقويم من سجل التقويم لإكمال بيانات الحالة",
    xray_record: "تُسجَّل الأشعة من سجل الأشعة — دخلها للعيادة لا للطبيب",
  } satisfies Record<TreatmentTypeFailure, string>;
  return messages[reason];
}

/** «  حشوة   مؤقتة » → «حشوة مؤقتة» — one written form per treatment. */
function normalizeTreatmentName(nameAr: string): string {
  return nameAr.trim().replace(/\s+/g, " ");
}

/**
 * Resolve a typed treatment name to a treatment type id, creating it if new.
 *
 * The lookup deliberately spans INACTIVE types too: a name that was switched
 * off must not come back as a second row with the same wording, which would
 * split one treatment's history across two ids. A retyped inactive normal type
 * is switched back on instead — the secretary typing it is the clinic using it.
 */
export const findOrCreateTreatmentType = atomicMutation((
  nameAr: string,
): TreatmentTypeResult => {
  const name = normalizeTreatmentName(nameAr);
  if (!name) return { ok: false, reason: "empty_name" };

  // Matching is on the written name only — exactly what the secretary typed.
  // No keyword sniffing: «تنظيف تقويمي» is a perfectly ordinary treatment and
  // must be allowed, while «تقويم» itself is caught because it IS the row.
  const existing = db
    .select()
    .from(treatmentTypes)
    .where(sql`lower(trim(${treatmentTypes.nameAr})) = lower(${name})`)
    .get();

  if (existing) {
    if (existing.isImplant || existing.settlementBucket === "implant") {
      return { ok: false, reason: "implant_record" };
    }
    if (existing.isOrtho || existing.settlementBucket === ORTHO_BUCKET) {
      return { ok: false, reason: "ortho_record" };
    }
    if (existing.settlementBucket === XRAY_BUCKET) {
      return { ok: false, reason: "xray_record" };
    }
    if (!existing.isActive) {
      db.update(treatmentTypes)
        .set({ isActive: true })
        .where(eq(treatmentTypes.id, existing.id))
        .run();
      recordEdit({
        entity: "treatment_types",
        entityId: existing.id,
        action: "update",
        before: { isActive: false },
        after: { isActive: true },
        note: "treatment retyped in the daily entry",
      });
    }
    return { ok: true, id: existing.id, created: false };
  }

  // `key` is an internal handle only (the seeded types own the readable ones).
  // The timestamp can repeat inside one millisecond, and the column is unique,
  // so the first free suffix is taken rather than risking a failed write.
  let key = `custom_${Date.now()}`;
  for (let n = 2; db.select({ id: treatmentTypes.id }).from(treatmentTypes).where(eq(treatmentTypes.key, key)).get(); n++) {
    key = `custom_${Date.now()}_${n}`;
  }

  const values = {
    key,
    nameAr: name,
    nameEn: name,
    settlementBucket: "normal" as const,
    isImplant: false,
    isOrtho: false,
    isActive: true,
    // After every seeded type: a typed name is newer than the clinic's staples,
    // and the suggestion list orders by real usage anyway.
    sortOrder: 100,
  };
  const res = db.insert(treatmentTypes).values(values).run();
  const id = Number(res.lastInsertRowid);
  recordEdit({ entity: "treatment_types", entityId: id, action: "insert", after: values });
  return { ok: true, id, created: true };
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
  /** المقدمة المتفق عليها (التقويم) — تُسدَّد لاحقاً على دفعات. [2026-08-25] */
  downPaymentAgreed?: number;
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

/**
 * حالة تقويم مفتوحة السعر — قرار العيادة 2026-08-19.
 *
 * التقويم لم يعد له «إجمالي متفق عليه»: تُفتح الحالة بمقدمة، ثم تُسعَّر كل جلسة
 * عند الزيارة. `totalPrice === 0` هو العلامة التي تميّز هذه الحالات، وهي أيضاً
 * ما يحمي الحالات القديمة: حالة تقويم قديمة لها إجمالي محفوظ تبقى محكومة بسقفها.
 *
 * The bucket is read from the treatment type rather than the `isOrtho` flag so
 * this sits on the same fact the settlement uses to split money per doctor.
 */
function isOpenEndedOrtho(treatmentTypeId: number, totalPrice: number): boolean {
  if (totalPrice !== 0) return false;
  const type = db
    .select({ bucket: treatmentTypes.settlementBucket })
    .from(treatmentTypes)
    .where(eq(treatmentTypes.id, treatmentTypeId))
    .get();
  return type?.bucket === ORTHO_BUCKET;
}

/** Create a case; allocate implant card + account numbers if it's an implant. */
export const createCase = atomicMutation((input: NewCaseInput): number => {
  // 🔴 Throws rather than returning a result: every caller already validates
  // the date it passes, so reaching here with a bad one is a bug in a new
  // caller, not a mistyped form. `recordEdit` below stamps the audit period
  // from this date and `createCaseWithPayment` hands it to the first payment,
  // so a case opened in 2099 takes its money out of the month's books with
  // it. [2026-09-22]
  if (!isRecordableDate(input.openedDate)) {
    throw new Error(`Case opened date is not recordable: ${input.openedDate}`);
  }
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
      downPaymentAgreed: input.downPaymentAgreed ?? 0,
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
    downPaymentAgreed: number;
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
  // المقدمة المتفق عليها لا تنزل تحت ما قُبض منها فعلاً، وإلا صار «المتبقي من
  // المقدمة» بالسالب وقرأته العيادة ديناً على نفسها. [2026-08-25]
  if (fields.downPaymentAgreed !== undefined) {
    if (!Number.isSafeInteger(fields.downPaymentAgreed) || fields.downPaymentAgreed < 0) {
      return false;
    }
    if (fields.downPaymentAgreed < downPaymentCollected(caseId)) return false;
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

/** ما قُبض فعلاً من المقدمة على هذه الحالة (المقدمة وحدها، لا الجلسات). */
function downPaymentCollected(caseId: number): number {
  return (
    db
      .select({ value: sql<number>`coalesce(sum(${payments.amount}), 0)` })
      .from(payments)
      .where(and(eq(payments.caseId, caseId), eq(payments.kind, "down_payment")))
      .get()?.value ?? 0
  );
}

export type PaymentFailure =
  | "not_found"
  | "case_cancelled"
  | "invalid_amount"
  | "invalid_date"
  | "future_date"
  | "wrong_course"
  | "exceeds_remaining"
  | "exceeds_down_payment"
  | "refund_exceeds_paid";

export type PaymentResult =
  | { ok: true; paymentId: number; amount: number; remaining: number }
  | { ok: false; reason: PaymentFailure };

export function paymentFailureMessage(reason: PaymentFailure): string {
  const messages = {
    not_found: "لم يتم العثور على الحالة.",
    case_cancelled: "لا يمكن إضافة دفعة على حالة ملغاة.",
    invalid_amount: "أدخل مبلغاً صحيحاً أكبر من صفر.",
    invalid_date: "التاريخ غير صحيح.",
    future_date: "لا يمكن تسجيل دفعة بتاريخ لاحق لليوم — تحقّق من السنة.",
    wrong_course: "الحالة لا تنتمي إلى سجل العلاج المطلوب.",
    exceeds_remaining: "المبلغ أكبر من الرصيد المتبقي.",
    exceeds_down_payment: "المبلغ أكبر من المتبقي من المقدمة المتفق عليها.",
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
    // A payment cannot have happened tomorrow. Separated from the calendar
    // check so the message can name the real mistake — a mistyped year, which
    // is what this catches. See `isRecordableDate`. [2026-09-22]
    if (!isRecordableDate(input.paidDate)) {
      return { ok: false, reason: "future_date" };
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
      // حالة التقويم المفتوحة لا سقف لها: كل جلسة بمبلغها، فلا «متبقٍ» يُتجاوز.
      // [2026-08-19] The refund guard above still applies to it in full.
      const openEndedOrtho = isOpenEndedOrtho(
        treatmentCase.treatmentTypeId,
        treatmentCase.totalPrice,
      );
      if (
        !openEndedOrtho &&
        input.amount > Math.max(0, treatmentCase.totalPrice - paid)
      ) {
        return { ok: false, reason: "exceeds_remaining" };
      }
      // المقدمة وحدها لها سقفها: هي مبلغ متفق عليه يُسدَّد على دفعات، فدفعة
      // مقدمة تتجاوز ما بقي منه ليست مقدمة — هي جلسة أُدخلت في الحقل الخطأ.
      // الجلسات تبقى بلا سقف. [قرار العيادة 2026-08-25]
      if (
        kind === "down_payment" &&
        openEndedOrtho &&
        treatmentCase.downPaymentAgreed > 0 &&
        input.amount >
          Math.max(0, treatmentCase.downPaymentAgreed - downPaymentCollected(input.caseId))
      ) {
        return { ok: false, reason: "exceeds_down_payment" };
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
      // المقدمة على حالة تقويم مفتوحة السعر لا تُقاس بإجمالي — لا إجمالي أصلاً.
      // [2026-08-19] كل ما عداها يبقى محكوماً بسقف الحالة.
      const openEnded = isOpenEndedOrtho(input.treatmentTypeId, input.totalPrice);
      const agreedDown = input.downPaymentAgreed ?? 0;
      if (
        kind === "refund" ||
        !Number.isSafeInteger(input.firstPayment.amount) ||
        input.firstPayment.amount < 0 ||
        (!openEnded && input.firstPayment.amount > input.totalPrice) ||
        // أول دفعة على حالة تقويم هي دفعةٌ من المقدمة المتفق عليها، لا مبلغ حر.
        (openEnded &&
          kind === "down_payment" &&
          agreedDown > 0 &&
          input.firstPayment.amount > agreedDown)
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

// ── X-ray films (سجل الأشعة) [D9] ───────────────────────────────────────────
/**
 * تسجيل صورة أشعة — بلا مريض وبلا دَين. [قرار العيادة 2026-08-25]
 *
 * الفيلم بيعٌ نقدي في لحظته: سعره هو ما دخل الصندوق بتاريخه، فلا دفعات ولا
 * متبقٍ. والنوع يجب أن يكون من دلو الأشعة — وإلا صار بابٌ خلفيّ يُسجَّل منه
 * علاج أسنان كدخل للعيادة خارج حصص الأطباء. [D9]
 */
export type XrayFilmFailure =
  | "invalid_date"
  | "future_date"
  | "invalid_price"
  | "not_xray_type";

export type XrayFilmResult =
  | { ok: true; filmId: number }
  | { ok: false; reason: XrayFilmFailure };

export function xrayFilmFailureMessage(reason: XrayFilmFailure): string {
  const messages = {
    invalid_date: "التاريخ غير صحيح.",
    future_date: "لا يمكن تسجيل فيلم بتاريخ لاحق لليوم — تحقّق من السنة.",
    invalid_price: "أدخل سعراً صحيحاً (صفر أو أكثر).",
    not_xray_type: "النوع المختار ليس نوع أشعة.",
  } satisfies Record<XrayFilmFailure, string>;
  return messages[reason];
}

export const recordXrayFilm = atomicMutation((input: {
  filmDate: string;
  treatmentTypeId: number;
  placement: "internal" | "external";
  price: number;
}): XrayFilmResult => {
  if (!isValidISODate(input.filmDate)) {
    return { ok: false, reason: "invalid_date" };
  }
  // X-ray money is the clinic's income (D9), so a film dated years ahead walks
  // out of the month's books exactly like a payment does. [2026-09-22]
  if (!isRecordableDate(input.filmDate)) {
    return { ok: false, reason: "future_date" };
  }
  if (!Number.isSafeInteger(input.price) || input.price < 0) {
    return { ok: false, reason: "invalid_price" };
  }
  const type = db
    .select({ bucket: treatmentTypes.settlementBucket })
    .from(treatmentTypes)
    .where(eq(treatmentTypes.id, input.treatmentTypeId))
    .get();
  if (!type || type.bucket !== XRAY_BUCKET) {
    return { ok: false, reason: "not_xray_type" };
  }

  const res = db
    .insert(xrayFilms)
    .values({
      filmDate: input.filmDate,
      treatmentTypeId: input.treatmentTypeId,
      placement: input.placement,
      price: input.price,
    })
    .run();
  const filmId = Number(res.lastInsertRowid);
  recordEdit({
    entity: "xray_films",
    entityId: filmId,
    action: "insert",
    after: input,
    period: monthOf(input.filmDate),
  });
  return { ok: true, filmId };
});

/** حذف صورة مُسجَّلة خطأً. السطر يبقى كاملاً في سجل التعديلات. */
export const deleteXrayFilm = atomicMutation((id: number): boolean => {
  const before = db.select().from(xrayFilms).where(eq(xrayFilms.id, id)).get();
  if (!before) return false;
  db.delete(xrayFilms).where(eq(xrayFilms.id, id)).run();
  recordEdit({
    entity: "xray_films",
    entityId: id,
    action: "delete",
    before,
    period: monthOf(before.filmDate),
    note: "xray film removed",
  });
  return true;
});

// ملاحظة: لم تعد الأشعة تُسجَّل «حالة» على مريض — انظر `recordXrayFilm` أعلاه
// و`docs/OWNER-NOTES.md` §14. الصفوف القديمة تبقى في قاعدة البيانات وتُقرأ في
// «دخل الأشعة» (`xrayIncomeForPeriod`)، ولا شيء ينشئ صفاً جديداً منها.

// ── Case teeth (مخطط الأسنان) ───────────────────────────────────────────────
// See docs/TOOTH-CHART-SPEC.md. The scope rules below are the reason this is a
// mutation and not an insert from a screen: SQLite CHECK constraints cannot
// express "exactly one of toothCode/arch, depending on scope", and a chart that
// stores an arch as 16 tooth rows silently destroys what the doctor said.

export type ToothMarkInput =
  | { scope: "tooth"; toothCode: number; surfaces?: Surface[]; spanId?: number; spanRole?: "abutment" | "pontic"; note?: string }
  | { scope: "arch"; arch: "upper" | "lower"; note?: string }
  | { scope: "mouth"; note?: string };

export type ToothMarkFailure =
  | "case_not_found"
  | "bad_tooth_code"
  | "duplicate_tooth"
  | "bad_surfaces";

export function toothMarkFailureMessage(reason: ToothMarkFailure): string {
  switch (reason) {
    case "case_not_found":
      return "الحالة غير موجودة.";
    case "bad_tooth_code":
      return "رقم السن غير صحيح.";
    case "duplicate_tooth":
      return "السن مُعلَّم مرتين في نفس الحالة.";
    case "bad_surfaces":
      return "سطح غير صحيح لهذا السن.";
  }
}

const VALID_SURFACES: readonly Surface[] = ["mesial", "distal", "facial", "oral", "occlusal"];

/**
 * Replace every mark on a case with `marks`. Replace-all, not append: the chart
 * is a picture of the case, and the screen always sends the whole picture, so a
 * de-selected tooth disappears without needing a separate delete path.
 *
 * Passing an empty array is legitimate and clears the chart — «تقويم» and
 * «تنظيف» have no tooth at all, and forcing one would make the clerk invent it.
 */
export const setCaseTeeth = atomicMutation(
  (caseId: number, marks: ToothMarkInput[]): { ok: true } | { ok: false; reason: ToothMarkFailure } => {
    const theCase = db.select().from(cases).where(eq(cases.id, caseId)).get();
    if (!theCase) return { ok: false, reason: "case_not_found" };

    const seen = new Set<string>();
    for (const m of marks) {
      if (m.scope === "tooth") {
        if (!isValidToothCode(m.toothCode)) return { ok: false, reason: "bad_tooth_code" };
        if (m.surfaces) {
          if (m.surfaces.length === 0) return { ok: false, reason: "bad_surfaces" };
          for (const f of m.surfaces) {
            if (!VALID_SURFACES.includes(f)) return { ok: false, reason: "bad_surfaces" };
          }
        }
        // The same tooth may appear twice only if the faces differ (two separate
        // fillings on one tooth), so the identity is tooth + its face set.
        const key = `${m.toothCode}:${[...(m.surfaces ?? [])].sort().join(",")}`;
        if (seen.has(key)) return { ok: false, reason: "duplicate_tooth" };
        seen.add(key);
      }
    }

    const before = db.select().from(caseTeeth).where(eq(caseTeeth.caseId, caseId)).all();
    db.delete(caseTeeth).where(eq(caseTeeth.caseId, caseId)).run();

    for (const m of marks) {
      db.insert(caseTeeth)
        .values({
          caseId,
          scope: m.scope,
          toothCode: m.scope === "tooth" ? m.toothCode : null,
          arch: m.scope === "arch" ? m.arch : null,
          surfaces:
            m.scope === "tooth" && m.surfaces && m.surfaces.length > 0
              ? JSON.stringify(m.surfaces)
              : null,
          spanId: m.scope === "tooth" ? (m.spanId ?? null) : null,
          spanRole: m.scope === "tooth" ? (m.spanRole ?? null) : null,
          note: m.note ?? null,
        })
        .run();
    }

    recordEdit({
      entity: "case_teeth",
      entityId: caseId,
      action: "update",
      before,
      after: marks,
      period: monthOf(theCase.openedDate),
    });
    return { ok: true };
  },
);

/**
 * Open a case, take its first payment and chart its teeth — all or nothing.
 *
 * «إضافة علاج» on the patient file does the three in one save, and a chart the
 * mutations layer refuses (a duplicate tooth, a bad face) must not leave a case
 * and a payment behind without it: the clerk would fix the chart, save again,
 * and open the same treatment twice. The throw is what rolls the transaction
 * back; it never leaves this function.
 */
class ToothChartRejected extends Error {
  constructor(readonly reason: ToothMarkFailure) {
    super(reason);
  }
}

export function createCaseWithTeeth(
  input: Parameters<typeof createCaseWithPayment>[0] & { marks: ToothMarkInput[] },
): { ok: true; caseId: number } | { ok: false; reason: ToothMarkFailure } {
  const { marks, ...caseInput } = input;
  try {
    return atomicMutation(() => {
      const { caseId } = createCaseWithPayment(caseInput);
      if (marks.length > 0) {
        const teeth = setCaseTeeth(caseId, marks);
        if (!teeth.ok) throw new ToothChartRejected(teeth.reason);
      }
      return { ok: true as const, caseId };
    })();
  } catch (e) {
    if (e instanceof ToothChartRejected) return { ok: false, reason: e.reason };
    throw e;
  }
}


// ── Appointments (السجل الرئيسي: اسم المراجع + موعده) [B1] ────────────────────
// Deliberately holds NO clinical detail — the clinic was explicit that this
// register is only "اسم المراجع وعلياته بيجاي". Money lives on the case.

export type AppointmentStatus = "booked" | "came" | "no_show";

export const createAppointment = atomicMutation((input: {
  patientId: number;
  doctorId?: number | null;
  apptDate: string; // YYYY-MM-DD
  apptTime?: string | null; // HH:MM
  note?: string | null;
}): number => {
  const res = db
    .insert(appointments)
    .values({
      patientId: input.patientId,
      doctorId: input.doctorId ?? null,
      apptDate: input.apptDate,
      apptTime: input.apptTime || null,
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
  // Derived from the schema so the category list lives in exactly one place;
  // it was previously repeated here and drifted the moment a category was added.
  category: (typeof expenses.$inferInsert)["category"];
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
    demoDataAt: number | null;
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
  fields: Partial<{
    name: string;
    commissionPct: number | null;
    isActive: boolean;
    doesOrtho: boolean;
    doesImplants: boolean;
    doesNormal: boolean;
    labName: string | null;
  }>,
): void => {
  const before = db.select().from(doctors).where(eq(doctors.id, id)).get();
  db.update(doctors).set(fields).where(eq(doctors.id, id)).run();
  recordEdit({ entity: "doctors", entityId: id, action: "update", before, after: fields });
});

/** Add a doctor. New doctors go last in the list; % may be set later. */
export const createDoctor = atomicMutation((input: {
  name: string;
  commissionPct?: number | null;
  doesOrtho?: boolean;
  doesImplants?: boolean;
  doesNormal?: boolean;
  labName?: string | null;
}): number => {
  const maxOrder =
    db.select({ v: sql<number>`coalesce(max(${doctors.sortOrder}), 0)` }).from(doctors).get()?.v ?? 0;
  const res = db
    .insert(doctors)
    .values({
      name: input.name.trim(),
      commissionPct: input.commissionPct ?? null,
      doesOrtho: input.doesOrtho ?? false,
      doesImplants: input.doesImplants ?? true,
      doesNormal: input.doesNormal ?? true,
      labName: input.labName?.trim() || null,
      sortOrder: maxOrder + 1,
    })
    .run();
  const id = Number(res.lastInsertRowid);
  recordEdit({ entity: "doctors", entityId: id, action: "insert", after: input });
  return id;
});

/**
 * How many accounting records point at this doctor.
 *
 * ⚠️ Read this before offering to delete. `doctors.id` is referenced by five
 * tables — lab_entries, cases, payments, appointments, monthly_settlements —
 * and four of those columns are NOT NULL. A real DELETE either fails on the
 * foreign key or, worse, orphans money: a 500,000 case with no doctor, and a
 * settled month that can no longer be recomputed.
 */
export function doctorRefCounts(id: number): {
  cases: number;
  payments: number;
  appointments: number;
  labEntries: number;
  settlements: number;
  total: number;
} {
  // ⚠️ Five explicit queries rather than a generic helper: the table/column
  // types drizzle exposes differ per table, and a shared signature would need
  // `any`. Repetition is cheaper than losing type-checking on a delete guard.
  const n = (v: { n: number } | undefined) => v?.n ?? 0;
  const counts = {
    cases: n(db.select({ n: sql<number>`count(*)` }).from(cases).where(eq(cases.doctorId, id)).get()),
    payments: n(
      db.select({ n: sql<number>`count(*)` }).from(payments).where(eq(payments.doctorId, id)).get(),
    ),
    appointments: n(
      db
        .select({ n: sql<number>`count(*)` })
        .from(appointments)
        .where(eq(appointments.doctorId, id))
        .get(),
    ),
    labEntries: n(
      db.select({ n: sql<number>`count(*)` }).from(labEntries).where(eq(labEntries.doctorId, id)).get(),
    ),
    settlements: n(
      db
        .select({ n: sql<number>`count(*)` })
        .from(monthlySettlements)
        .where(eq(monthlySettlements.doctorId, id))
        .get(),
    ),
  };
  return { ...counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

/**
 * Delete a doctor **only if nothing references them**.
 *
 * The safe case this exists for: a name typed by mistake, or a doctor added
 * twice, before any work is booked against them. Anything else must be
 * deactivated instead (`updateDoctor({ isActive: false })`) — in a ledger the
 * past does not become untrue because someone left.
 *
 * ⚠️ Re-counts inside the mutation rather than trusting the caller's earlier
 * check: between rendering the button and pressing it, a case could have been
 * booked. `atomicMutation` wraps this in a transaction, so the count and the
 * delete cannot be split.
 */
export const deleteDoctor = atomicMutation((id: number): { ok: boolean; refs: number } => {
  const refs = doctorRefCounts(id).total;
  if (refs > 0) return { ok: false, refs };
  const before = db.select().from(doctors).where(eq(doctors.id, id)).get();
  db.delete(doctors).where(eq(doctors.id, id)).run();
  recordEdit({ entity: "doctors", entityId: id, action: "delete", before });
  return { ok: true, refs: 0 };
});

// ── مستحقات المختبر (تتبّع فقط) ──────────────────────────────────────────────
/**
 * Record what a doctor owes his lab, or a payment he made to it (negative).
 *
 * `markStale: false` is the whole point of this mutation existing separately:
 * lab money never enters a payout, so a bill written against an already-closed
 * month leaves every doctor's settled share exactly as it was. Re-opening a
 * closed month for it would be a false alarm. [D4, decision 2026-08-19]
 */
export const addLabEntry = atomicMutation((input: {
  doctorId: number;
  branch: "fixed" | "mobile";
  entryDate: string;
  amount: number;
  note?: string | null;
  patientId?: number | null;
}): number => {
  const res = db
    .insert(labEntries)
    .values({
      doctorId: input.doctorId,
      branch: input.branch,
      entryDate: input.entryDate,
      amount: input.amount,
      note: input.note?.trim() || null,
      patientId: input.patientId ?? null,
    })
    .run();
  const id = Number(res.lastInsertRowid);
  recordEdit({
    entity: "lab_entries",
    entityId: id,
    action: "insert",
    after: input,
    period: input.entryDate.slice(0, 7),
    markStale: false,
  });
  return id;
});

/** Remove a lab entry. Same closed-period reasoning as `addLabEntry`. */
export const deleteLabEntry = atomicMutation((id: number): boolean => {
  const before = db.select().from(labEntries).where(eq(labEntries.id, id)).get();
  if (!before) return false;
  db.delete(labEntries).where(eq(labEntries.id, id)).run();
  recordEdit({
    entity: "lab_entries",
    entityId: id,
    action: "delete",
    before,
    period: before.entryDate.slice(0, 7),
    markStale: false,
  });
  return true;
});

// ── Wipe (demo data removal / start-over) ───────────────────────────────────

export interface WipeCounts {
  patients: number;
  cases: number;
  payments: number;
  appointments: number;
  expenses: number;
  cashMovements: number;
  settlements: number;
  xrayFilms: number;
  caseTeeth: number;
  labEntries: number;
}

/**
 * Delete every clinical and financial record, keeping the clinic's SETUP:
 * doctors, treatment types, prices, PIN and settings all survive.
 *
 * This is what removes the demo dataset, and it is deliberately the only path
 * that does — a wipe that tried to delete "just the demo rows" would need to
 * tell demo records from real ones, and any mistake there either strands fake
 * money in the clinic's books or deletes a real patient. Erasing everything and
 * keeping the setup is the one rule with no ambiguous cases.
 *
 * The audit log goes too: it is a log OF these records, and leaving fake
 * history behind would make سجل التعديلات lie. One entry describing the wipe is
 * written afterwards, so the empty log still explains itself.
 *
 * Counters reset so implant card numbers start at 1 again for the real clinic.
 */
export const wipeAllRecords = atomicMutation((note: string): WipeCounts => {
  const count = (rows: unknown[]) => rows.length;
  const removed: WipeCounts = {
    patients: count(db.select({ id: patients.id }).from(patients).all()),
    cases: count(db.select({ id: cases.id }).from(cases).all()),
    payments: count(db.select({ id: payments.id }).from(payments).all()),
    appointments: count(db.select({ id: appointments.id }).from(appointments).all()),
    expenses: count(db.select({ id: expenses.id }).from(expenses).all()),
    cashMovements: count(db.select({ id: cashMovements.id }).from(cashMovements).all()),
    settlements: count(db.select({ id: monthlySettlements.id }).from(monthlySettlements).all()),
    // الفيلم لا يرتبط بمريض، فلا تحذفه سلسلةُ الحذف تلقائياً — ولو بقي لبقي
    // دخل أشعة تجريبي في دفاتر العيادة الحقيقية إلى الأبد. [2026-08-25]
    xrayFilms: count(db.select({ id: xrayFilms.id }).from(xrayFilms).all()),
    // 🔴 مخطط الأسنان يشير إلى الحالة، والمفاتيح الأجنبية مفعّلة — فحذف الحالات
    // قبل حذف علاماتها كان يرمي «FOREIGN KEY constraint failed» ويُلغي المسح
    // كلّه. يكفي مخطط واحد محفوظ من `/cases/[id]/teeth` كي يتعطّل المسح، وهو
    // أول خطوة في إجراء التسليم. [2026-08-28]
    caseTeeth: count(db.select({ id: caseTeeth.id }).from(caseTeeth).all()),
    // 🔴 قيود المختبر كانت تنجو من المسح بصمت: لا شيء يشير إليها فلا ترمي
    // خطأً، فتبقى مستحقات مختبر تجريبية تظهر في «الأطباء» ودفتر المختبرات
    // كلها على أنها ديون حقيقية. نفس سبب حذف الأفلام أعلاه. [2026-08-28]
    labEntries: count(db.select({ id: labEntries.id }).from(labEntries).all()),
  };

  // Children before parents — foreign keys are ON.
  db.delete(payments).run();
  db.delete(appointments).run();
  // case_teeth → cases, so it must go first or the whole wipe rolls back.
  db.delete(caseTeeth).run();
  db.delete(cases).run();
  // lab_entries → patients (optional column, unused by any form today) as well
  // as doctors, which survive. Before patients, so it stays safe if that column
  // is ever wired up.
  db.delete(labEntries).run();
  db.delete(patients).run();
  db.delete(expenses).run();
  db.delete(cashMovements).run();
  db.delete(monthlySettlements).run();
  db.delete(xrayFilms).run();
  db.delete(auditLog).run();

  db.update(counters).set({ value: 0 }).run();
  db.update(settings).set({ demoDataAt: null, updatedAt: Date.now() }).where(eq(settings.id, 1)).run();

  recordEdit({ entity: "settings", entityId: 1, action: "delete", before: removed, note });
  return removed;
});
