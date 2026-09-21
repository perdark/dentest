"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  findOrCreatePatient,
  findOrCreateTreatmentType,
  createCaseWithPayment,
  treatmentTypeFailureMessage,
} from "@/lib/mutations";
import { parseAmount } from "@/lib/format";
import { isValidISODate } from "@/lib/dates";
import { requireAuth } from "@/lib/auth";

export type VisitFormState = { ok?: boolean; error?: string };

/**
 * «الدفتر اليومي» opens new cases only. A payment against an already-open case
 * is recorded from «الديون ← إضافة دفعة» (`recordDebtPayment`), which picks the
 * case by its own balance — this file used to carry a second entry point for
 * the same money and it was removed 2026-09-22.
 */
// ── New case + (optional) first payment ──────────────────────────────────────
export async function createVisitNewCase(
  _prev: VisitFormState,
  formData: FormData,
): Promise<VisitFormState> {
  await requireAuth();
  const parsed = z
    .object({
      patientName: z.string(),
      phone: z.string().optional(),
      doctorId: z.coerce.number(),
      treatmentName: z.string().trim().min(1),
      price: z.string().optional(),
      discount: z.string().optional(),
      paidNow: z.string().optional(),
      date: z.string(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "تحقق من الحقول المدخلة" };
  const d = parsed.data;

  const patientName = d.patientName.trim();
  if (!patientName) return { error: "اسم المريض مطلوب" };
  if (!Number.isInteger(d.doctorId) || d.doctorId <= 0) return { error: "اختر الطبيب" };
  if (!isValidISODate(d.date)) return { error: "التاريخ غير صحيح" };

  // Totals are computed server-side — never trusted from the client.
  const price = parseAmount(d.price);
  const discount = parseAmount(d.discount);
  const paidNow = parseAmount(d.paidNow);
  if (price < 0 || discount < 0 || paidNow < 0) return { error: "المبالغ يجب أن تكون موجبة" };
  const total = Math.max(0, price - discount);
  if (paidNow > total) return { error: "الدفعة الأولى أكبر من إجمالي العلاج" };

  // Last of the checks on purpose: this one can WRITE (a name nobody has typed
  // before becomes a treatment type), so nothing gets created for a form that
  // was going to be refused anyway. It also owns the D9 guard — an implant,
  // ortho or X-ray name is refused here instead of being cloned as normal work.
  const treatment = findOrCreateTreatmentType(d.treatmentName);
  if (!treatment.ok) return { error: treatmentTypeFailureMessage(treatment.reason) };

  const patientId = findOrCreatePatient({ fullName: patientName, phone: d.phone || null });

  createCaseWithPayment({
    patientId,
    doctorId: d.doctorId,
    treatmentTypeId: treatment.id,
    openedDate: d.date,
    listPrice: price,
    discount,
    totalPrice: total,
    firstPayment: paidNow > 0 ? { amount: paidNow, kind: "down_payment" } : undefined,
  });

  revalidatePath("/daily");
  revalidatePath("/dashboard");
  return { ok: true };
}
