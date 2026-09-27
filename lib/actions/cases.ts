"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  caseEditFailureMessage,
  deleteCaseCascade,
  findOrCreateTreatmentType,
  treatmentTypeFailureMessage,
  updateCaseRecord,
} from "@/lib/mutations";
import { caseRaw } from "@/lib/queries";
import { parseAmount } from "@/lib/format";
import { requireAuth } from "@/lib/auth";

export type CaseEditState = { ok?: boolean; error?: string };

/** A case's money shows on every one of these screens. */
function revalidateCaseScreens(patientId: number) {
  revalidatePath(`/patients/${patientId}`);
  for (const path of ["/patients", "/daily", "/debts", "/implants", "/ortho", "/settlement", "/dashboard"]) {
    revalidatePath(path, "layout");
  }
}

// ── تعديل حالة عادية ─────────────────────────────────────────────────────────
const editSchema = z.object({
  caseId: z.coerce.number().int().positive(),
  doctorId: z.coerce.number().int().positive("اختر الطبيب"),
  treatmentName: z.string().trim().min(1, "اكتب اسم العلاج"),
  price: z.string().optional().default(""),
  discount: z.string().optional().default(""),
  date: z.string().trim(),
  notes: z.string().trim().max(1000).optional().default(""),
});

export async function updateCaseAction(
  _prev: CaseEditState,
  formData: FormData,
): Promise<CaseEditState> {
  await requireAuth();
  const parsed = editSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "تحقّق من البيانات المُدخلة" };
  }
  const d = parsed.data;
  const existing = caseRaw(d.caseId);
  if (!existing) return { error: caseEditFailureMessage("not_found") };

  // المبالغ تُحسب هنا من جديد — لا يُوثق بأي رقم محسوب في المتصفّح.
  const price = parseAmount(d.price);
  const discount = parseAmount(d.discount);
  if (price < 0 || discount < 0) return { error: "المبالغ يجب أن تكون موجبة" };
  if (discount > price) return { error: "الخصم أكبر من السعر" };

  // Last before the write, as on «إضافة علاج»: a new name creates a type.
  const treatment = findOrCreateTreatmentType(d.treatmentName);
  if (!treatment.ok) return { error: treatmentTypeFailureMessage(treatment.reason) };

  const result = updateCaseRecord(d.caseId, {
    doctorId: d.doctorId,
    treatmentTypeId: treatment.id,
    openedDate: d.date,
    listPrice: price,
    discount,
    notes: d.notes || null,
  });
  if (!result.ok) return { error: caseEditFailureMessage(result.reason) };

  revalidateCaseScreens(existing.patientId);
  return { ok: true };
}

// ── حذف حالة مع دفعاتها ──────────────────────────────────────────────────────
const idSchema = z.object({ caseId: z.coerce.number().int().positive() });

export async function deleteCaseAction(
  _prev: CaseEditState,
  formData: FormData,
): Promise<CaseEditState> {
  await requireAuth();
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "حالة غير صالحة" };

  const existing = caseRaw(parsed.data.caseId);
  if (!existing || !deleteCaseCascade(parsed.data.caseId)) {
    return { error: caseEditFailureMessage("not_found") };
  }

  revalidateCaseScreens(existing.patientId);
  return { ok: true };
}
