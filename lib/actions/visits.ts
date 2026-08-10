"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  findOrCreatePatient,
  createCaseWithPayment,
  paymentFailureMessage,
  recordCasePayment,
} from "@/lib/mutations";
import { formatIQD, parseAmount } from "@/lib/format";
import { isValidISODate } from "@/lib/dates";
import { requireAuth } from "@/lib/auth";
import { getTreatmentType, openCasesBrief } from "@/lib/queries";

export type VisitFormState = { ok?: boolean; error?: string };

export type CaseOption = { id: number; label: string };

/**
 * Server-side search for the payment picker. The clinic has hundreds of open
 * implant cards, so the dialog cannot ship them all to the browser. [D3]
 */
export async function searchCollectableCases(q: string): Promise<CaseOption[]> {
  await requireAuth();
  const term = typeof q === "string" ? q.slice(0, 60) : "";
  return openCasesBrief(term).map((c) => ({
    id: c.id,
    label: `${c.patientName} · ${c.treatment} · متبقٍ ${formatIQD(c.remaining)}`,
  }));
}

// ── Mode A: new case + (optional) first payment ──────────────────────────────
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
      treatmentTypeId: z.coerce.number(),
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
  if (!Number.isInteger(d.treatmentTypeId) || d.treatmentTypeId <= 0)
    return { error: "اختر العلاج" };
  if (!isValidISODate(d.date)) return { error: "التاريخ غير صحيح" };

  const treatment = getTreatmentType(d.treatmentTypeId);
  if (!treatment || !treatment.isActive) return { error: "نوع العلاج غير موجود" };
  if (treatment.isImplant) {
    return { error: "تُفتح حالات الزراعة من سجل الزراعة لإكمال بيانات البطاقة" };
  }
  if (treatment.isOrtho) {
    return { error: "تُفتح حالات التقويم من سجل التقويم لإكمال بيانات الحالة" };
  }

  // Totals are computed server-side — never trusted from the client.
  const price = parseAmount(d.price);
  const discount = parseAmount(d.discount);
  const paidNow = parseAmount(d.paidNow);
  if (price < 0 || discount < 0 || paidNow < 0) return { error: "المبالغ يجب أن تكون موجبة" };
  const total = Math.max(0, price - discount);
  if (paidNow > total) return { error: "الدفعة الأولى أكبر من إجمالي العلاج" };

  const patientId = findOrCreatePatient({ fullName: patientName, phone: d.phone || null });

  createCaseWithPayment({
    patientId,
    doctorId: d.doctorId,
    treatmentTypeId: d.treatmentTypeId,
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

// ── Mode B: payment on an existing open case ─────────────────────────────────
export async function addVisitPayment(
  _prev: VisitFormState,
  formData: FormData,
): Promise<VisitFormState> {
  await requireAuth();
  const parsed = z
    .object({
      caseId: z.coerce.number(),
      amount: z.string(),
      kind: z.enum(["session", "down_payment", "adjustment", "refund"]),
      date: z.string(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "تحقق من الحقول المدخلة" };
  const d = parsed.data;

  if (!Number.isInteger(d.caseId) || d.caseId <= 0) return { error: "اختر الحالة" };
  if (!isValidISODate(d.date)) return { error: "التاريخ غير صحيح" };

  const amount = parseAmount(d.amount);
  if (amount <= 0) return { error: "أدخل مبلغاً صحيحاً" };

  const result = recordCasePayment({
    caseId: d.caseId,
    amount,
    kind: d.kind,
    paidDate: d.date,
  });
  if (!result.ok) return { error: paymentFailureMessage(result.reason) };

  revalidatePath("/daily");
  revalidatePath("/dashboard");
  return { ok: true };
}
