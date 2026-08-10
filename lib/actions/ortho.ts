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
export async function createOrthoCase(
  _prev: OrthoFormState,
  formData: FormData,
): Promise<OrthoFormState> {
  await requireAuth();
  const schema = z.object({
    patientName: z.string().trim().min(1),
    phone: z.string().trim().optional(),
    doctorId: z.coerce.number().int().positive(),
    total: z.string().optional(),
    discount: z.string().optional(),
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
  const total = parseAmount(d.total ?? "");
  const discount = parseAmount(d.discount ?? "");
  const downPayment = parseAmount(d.downPayment ?? "");

  if (total <= 0) return { error: "أدخل الإجمالي المتفق عليه." };
  if (discount < 0 || downPayment < 0) return { error: "المبالغ يجب أن تكون موجبة." };
  if (downPayment > total) return { error: "المقدمة أكبر من الإجمالي المتفق عليه." };

  // listPrice = السعر قبل الخصم (يُحفظ لاتساق total = listPrice − discount).
  const listPrice = total + discount;
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
    listPrice,
    discount,
    totalPrice: total,
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
