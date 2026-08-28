"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  findOrCreatePatient,
  createCaseWithPayment,
  paymentFailureMessage,
  recordCasePayment,
  updateCaseMeta,
} from "@/lib/mutations";
import { listTreatmentTypes } from "@/lib/queries";
import { parseAmount } from "@/lib/format";
import { todayISO, isValidISODate } from "@/lib/dates";
import { requireAuth } from "@/lib/auth";

export type OrthoFormState = { error?: string; ok?: boolean };

/** The seeded ortho treatment type (settlement bucket = ortho). */
function orthoTreatmentTypeId(): number | null {
  const t = listTreatmentTypes().find((x) => x.isOrtho);
  return t ? t.id : null;
}

function revalidateOrtho(caseId?: number) {
  revalidatePath("/ortho");
  if (caseId) revalidatePath(`/ortho/${caseId}`);
  revalidatePath("/dashboard");
}

// ── New ortho case (with optional down payment) ─────────────────────────────
/**
 * فتح حالة تقويم — بلا إجمالي متفق عليه. [قرار العيادة 2026-08-19]
 *
 * التقويم يُتابع شهوراً: مقدمة في البداية، ثم مبلغ يُكتب عند كل جلسة. لا يوجد
 * رقم نهائي يُتفق عليه يوم الفتح، فالحالة تُحفظ بإجمالي صفر وتبقى مفتوحة،
 * ولا يظهر لها «متبقٍ» في أي شاشة ولا في الديون.
 */
export async function createOrthoCase(
  _prev: OrthoFormState,
  formData: FormData,
): Promise<OrthoFormState> {
  await requireAuth();
  const schema = z.object({
    patientName: z.string().trim().min(1),
    phone: z.string().trim().optional(),
    doctorId: z.coerce.number().int().positive(),
    downPaymentAgreed: z.string().optional(),
    downPayment: z.string().optional(),
    openedDate: z.string().optional(),
    nextAppointment: z.string().optional(),
  });

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "تحقّق من الحقول المطلوبة: اسم المريض والطبيب." };
  }
  const d = parsed.data;

  const treatmentTypeId = orthoTreatmentTypeId();
  if (!treatmentTypeId) {
    return { error: "نوع علاج التقويم غير مُهيّأ في النظام." };
  }

  // All money computed server-side, integer dinars only.
  // المقدمة رقمان: المتفق عليه (يُثبَّت على الحالة) والمقبوض اليوم منه. كانت
  // المقدمة تُقبض كاملة يوم الفتح، والعيادة تتفق على ٢٠٠ وتقبض ٥٠.
  // [قرار العيادة 2026-08-25]
  const downPaymentAgreed = parseAmount(d.downPaymentAgreed ?? "");
  const downPayment = parseAmount(d.downPayment ?? "");
  if (downPayment < 0 || downPaymentAgreed < 0) {
    return { error: "المبالغ يجب أن تكون موجبة." };
  }
  if (downPaymentAgreed > 0 && downPayment > downPaymentAgreed) {
    return { error: "المدفوع من المقدمة أكبر من المقدمة المتفق عليها." };
  }

  const openedDate =
    d.openedDate && isValidISODate(d.openedDate) ? d.openedDate : todayISO();
  const nextAppointment =
    d.nextAppointment && isValidISODate(d.nextAppointment) ? d.nextAppointment : null;

  const patientId = findOrCreatePatient({
    fullName: d.patientName,
    phone: d.phone || null,
  });

  const { caseId } = createCaseWithPayment({
    patientId,
    doctorId: d.doctorId,
    treatmentTypeId,
    openedDate,
    // صفر في الثلاثة: لا سعر قائمة ولا خصم ولا إجمالي — المال كله دفعات.
    listPrice: 0,
    discount: 0,
    totalPrice: 0,
    downPaymentAgreed,
    notes: null,
    firstPayment:
      downPayment > 0 ? { amount: downPayment, kind: "down_payment" } : undefined,
  });

  // createCase has no nextAppointment field — set it via case meta.
  if (nextAppointment) {
    updateCaseMeta(caseId, { nextAppointment }, "ortho");
  }

  revalidateOrtho(caseId);
  redirect(`/ortho/${caseId}`);
}

// ── Add a session payment (credited to the case doctor) ─────────────────────
export async function addOrthoPayment(
  _prev: OrthoFormState,
  formData: FormData,
): Promise<OrthoFormState> {
  await requireAuth();
  const schema = z.object({
    caseId: z.coerce.number().int().positive(),
    amount: z.string().optional(),
    paidDate: z.string().optional(),
    note: z.string().optional(),
  });

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "تحقّق من بيانات الدفعة" };
  const d = parsed.data;

  const amount = parseAmount(d.amount ?? "");
  if (amount <= 0) return { error: "أدخل مبلغاً صحيحاً أكبر من صفر" };

  const paidDate =
    d.paidDate && isValidISODate(d.paidDate) ? d.paidDate : todayISO();

  const result = recordCasePayment({
    caseId: d.caseId,
    amount,
    kind: "session",
    paidDate,
    note: d.note?.trim() || null,
    expectedCourse: "ortho",
  });
  if (!result.ok) return { error: paymentFailureMessage(result.reason) };

  revalidateOrtho(d.caseId);
  return { ok: true };
}

// ── Pay part of the agreed down payment ─────────────────────────────────────
/**
 * دفعة من المقدمة — لا مقدمة كاملة.
 *
 * المقدمة تُحدَّد مرة واحدة على الحالة ثم تُسدَّد شيئاً فشيئاً، فكل دفعة هنا
 * قيدٌ من نوع `down_payment` وسقفها ما بقي من المتفق عليه (الحدّ نفسه محفوظ في
 * `recordCasePayment`، لا هنا وحده). [قرار العيادة 2026-08-25]
 */
export async function addOrthoDownPayment(
  _prev: OrthoFormState,
  formData: FormData,
): Promise<OrthoFormState> {
  await requireAuth();
  const schema = z.object({
    caseId: z.coerce.number().int().positive(),
    amount: z.string().optional(),
    paidDate: z.string().optional(),
    note: z.string().optional(),
  });

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "تحقّق من بيانات الدفعة" };
  const d = parsed.data;

  const amount = parseAmount(d.amount ?? "");
  if (amount <= 0) return { error: "أدخل مبلغاً صحيحاً أكبر من صفر" };

  const paidDate =
    d.paidDate && isValidISODate(d.paidDate) ? d.paidDate : todayISO();

  const result = recordCasePayment({
    caseId: d.caseId,
    amount,
    kind: "down_payment",
    paidDate,
    note: d.note?.trim() || null,
    expectedCourse: "ortho",
  });
  if (!result.ok) return { error: paymentFailureMessage(result.reason) };

  revalidateOrtho(d.caseId);
  return { ok: true };
}

// ── Set / correct the agreed down payment ───────────────────────────────────
export async function setOrthoDownPayment(
  _prev: OrthoFormState,
  formData: FormData,
): Promise<OrthoFormState> {
  await requireAuth();
  const schema = z.object({
    caseId: z.coerce.number().int().positive(),
    downPaymentAgreed: z.string().optional(),
  });

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "تحقّق من بيانات المقدمة" };
  const d = parsed.data;

  const downPaymentAgreed = parseAmount(d.downPaymentAgreed ?? "");
  if (downPaymentAgreed < 0) return { error: "المقدمة يجب أن تكون موجبة." };

  const updated = updateCaseMeta(d.caseId, { downPaymentAgreed }, "ortho");
  // الرفض هنا سببه الوحيد المعروف: المقدمة الجديدة أقل مما قُبض منها فعلاً.
  if (!updated) {
    return { error: "لا يمكن جعل المقدمة أقل من المبلغ المقبوض منها." };
  }

  revalidateOrtho(d.caseId);
  return { ok: true };
}

// ── Close / reopen the case ─────────────────────────────────────────────────
/**
 * إغلاق حالة التقويم.
 *
 * التقويم بلا إجمالي، فلا شيء يُغلق الحالة من نفسه: العيادة هي التي تقول
 * «انتهى». الإغلاق يوقف إضافة الجلسات ولا يمسّ ما حُصِّل — الحصص محسوبة على
 * الدفعات لا على حالة الملف. [قرار العيادة 2026-08-25]
 */
export async function setOrthoStatus(
  _prev: OrthoFormState,
  formData: FormData,
): Promise<OrthoFormState> {
  await requireAuth();
  const schema = z.object({
    caseId: z.coerce.number().int().positive(),
    status: z.enum(["open", "completed"]),
  });

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "تحقّق من حالة الملف" };
  const d = parsed.data;

  const updated = updateCaseMeta(d.caseId, { status: d.status }, "ortho");
  if (!updated) return { error: "تعذّر تحديث الحالة؛ تحقّق من نوع العلاج" };

  revalidateOrtho(d.caseId);
  return { ok: true };
}

// ── Update next appointment + complaint flag/note (dispute protection) ───────
export async function updateOrtho(
  _prev: OrthoFormState,
  formData: FormData,
): Promise<OrthoFormState> {
  await requireAuth();
  const schema = z.object({
    caseId: z.coerce.number().int().positive(),
    nextAppointment: z.string().optional(),
    complaintNote: z.string().optional(),
  });

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "تحقّق من بيانات الحالة" };
  const d = parsed.data;

  // تاريخ مكتوب لكنه غير صالح يجب أن يُرفض، لا أن يمسح الموعد بصمت. [D1]
  const rawAppt = d.nextAppointment?.trim() ?? "";
  if (rawAppt !== "" && !isValidISODate(rawAppt)) {
    return { error: "تاريخ الموعد غير صحيح" };
  }

  // Checkbox: present when ticked, absent otherwise.
  const hasComplaint = formData.get("hasComplaint") != null;

  const updated = updateCaseMeta(d.caseId, {
    nextAppointment: rawAppt === "" ? null : rawAppt,
    hasComplaint,
    complaintNote: d.complaintNote?.trim() || null,
  }, "ortho");
  if (!updated) return { error: "تعذّر تحديث الحالة؛ تحقّق من نوع العلاج" };

  revalidateOrtho(d.caseId);
  return { ok: true };
}
