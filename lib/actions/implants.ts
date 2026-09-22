"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { listTreatmentTypes } from "@/lib/queries";
import {
  findOrCreatePatient,
  createCaseWithPayment,
  updateCaseMeta,
  paymentFailureMessage,
  recordCasePayment,
} from "@/lib/mutations";
import { parseAmount } from "@/lib/format";
import { todayISO, isRecordableDate } from "@/lib/dates";
import { requireAuth } from "@/lib/auth";

export type ImplantFormState = { ok?: boolean; error?: string };

const optionalText = z.string().optional().default("");

/**
 * «الجهاز» was dropped from the implant card — the clinic does not record an
 * implant system per case, so the field only ever collected blanks. The column
 * stays in the database so the few cards that do carry a value keep it; no
 * screen writes it any more.
 */

// ── إنشاء بطاقة زراعة جديدة ───────────────────────────────────────────────────
const createSchema = z.object({
  fullName: z.string().trim().min(1, "اسم المريض مطلوب"),
  phone: optionalText,
  doctorId: z.coerce.number().int().positive("اختر الطبيب المعالج"),
  address: optionalText,
  price: optionalText,
  discount: optionalText,
  downPayment: optionalText,
  date: optionalText,
});

export async function createImplantCard(
  _prev: ImplantFormState,
  formData: FormData,
): Promise<ImplantFormState> {
  await requireAuth();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "تحقق من البيانات المُدخلة" };
  }
  const d = parsed.data;

  const implantType = listTreatmentTypes().find((t) => t.isImplant);
  if (!implantType) {
    return { error: "لم يتم العثور على نوع علاج الزراعة في النظام" };
  }

  // كل المبالغ تُحسب على الخادم — لا نثق بأي إجمالي من المتصفّح.
  const date = d.date && isRecordableDate(d.date) ? d.date : todayISO();
  const price = Math.max(0, parseAmount(d.price));
  const discount = Math.max(0, parseAmount(d.discount));
  const total = Math.max(0, price - discount);
  const downPayment = Math.max(0, parseAmount(d.downPayment));
  if (downPayment > total) {
    return { error: "الدفعة الأولى أكبر من إجمالي العلاج" };
  }

  const patientId = findOrCreatePatient({
    fullName: d.fullName,
    phone: d.phone || null,
    address: d.address || null,
  });

  createCaseWithPayment({
    patientId,
    doctorId: d.doctorId,
    treatmentTypeId: implantType.id,
    openedDate: date,
    listPrice: price,
    discount,
    totalPrice: total,
    address: d.address || null,
    firstPayment: { amount: downPayment, kind: "down_payment" },
  });

  revalidatePath("/implants");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ── تعديل بيانات البطاقة ──────────────────────────────────────────────────────
const updateSchema = z.object({
  caseId: z.coerce.number().int().positive(),
  address: optionalText,
  labCost: optionalText,
  // السعر الكلي قبل الخصم — الإجمالي مشتقّ منه على الخادم، لا يُرسَل من المتصفّح.
  price: optionalText,
  discount: optionalText,
  status: z.enum(["open", "completed", "cancelled"]),
  notes: optionalText,
});

export async function updateImplantCard(
  _prev: ImplantFormState,
  formData: FormData,
): Promise<ImplantFormState> {
  await requireAuth();
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "تحقق من البيانات المُدخلة" };
  }
  const d = parsed.data;

  // الإجمالي يُشتقّ دائماً من السعر والخصم حتى لا ينكسر
  // الثابت total = listPrice − discount عند التعديل. [A3]
  const price = Math.max(0, parseAmount(d.price));
  const discount = Math.max(0, parseAmount(d.discount));
  if (discount > price) {
    return { error: "الخصم أكبر من السعر الكلي" };
  }

  // `device` is deliberately absent: updateCaseMeta patches only the keys it
  // is given, so an edit no longer blanks a value the screen cannot show.
  const updated = updateCaseMeta(d.caseId, {
    addressSnapshot: d.address.trim() || null,
    labCost: Math.max(0, parseAmount(d.labCost)),
    listPrice: price,
    discount,
    totalPrice: price - discount,
    status: d.status,
    notes: d.notes.trim() || null,
  }, "implant");
  if (!updated) {
    return { error: "تعذّر تحديث البطاقة؛ تحقق من النوع ومن أن الإجمالي لا يقل عن المدفوع" };
  }

  revalidatePath("/implants");
  revalidatePath(`/implants/${d.caseId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

// ── إضافة جلسة (دفعة) للبطاقة ─────────────────────────────────────────────────
const sessionSchema = z.object({
  caseId: z.coerce.number().int().positive(),
  amount: z.string().trim().min(1, "أدخل مبلغ الجلسة"),
  date: optionalText,
  note: optionalText,
});

export async function addImplantSession(
  _prev: ImplantFormState,
  formData: FormData,
): Promise<ImplantFormState> {
  await requireAuth();
  const parsed = sessionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "تحقق من البيانات المُدخلة" };
  }
  const d = parsed.data;

  const amount = Math.max(0, parseAmount(d.amount));
  if (amount <= 0) {
    return { error: "أدخل مبلغاً صحيحاً أكبر من صفر" };
  }
  const date = d.date && isRecordableDate(d.date) ? d.date : todayISO();

  const result = recordCasePayment({
    caseId: d.caseId,
    amount,
    kind: "session",
    paidDate: date,
    note: d.note.trim() || null,
    expectedCourse: "implant",
  });
  if (!result.ok) return { error: paymentFailureMessage(result.reason) };

  revalidatePath("/implants");
  revalidatePath(`/implants/${d.caseId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
