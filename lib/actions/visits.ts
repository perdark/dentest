"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  findOrCreatePatient,
  findOrCreateTreatmentType,
  createCaseWithPayment,
  paymentFailureMessage,
  recordCasePayment,
  treatmentTypeFailureMessage,
} from "@/lib/mutations";
import { formatIQD, parseAmount } from "@/lib/format";
import { isValidISODate } from "@/lib/dates";
import { requireAuth } from "@/lib/auth";
import { openCasesBrief } from "@/lib/queries";
import { medicalFlagsMarker } from "@/lib/strings";

export type VisitFormState = { ok?: boolean; error?: string };

/**
 * `remaining` travels as a number beside the label, never parsed back out of
 * it: the live line under the amount field does arithmetic with it, and text
 * that exists to be read must not double as a data channel.
 */
export type CaseOption = { id: number; label: string; remaining: number };

/**
 * Server-side search for the payment picker. The clinic has hundreds of open
 * implant cards, so the dialog cannot ship them all to the browser. [D3]
 */
export async function searchCollectableCases(q: string): Promise<CaseOption[]> {
  await requireAuth();
  const term = typeof q === "string" ? q.slice(0, 60) : "";
  return openCasesBrief(term).map((c) => ({
    id: c.id,
    label:
      `${c.patientName} · ${c.treatment} · متبقٍ ${formatIQD(c.remaining)}` +
      medicalFlagsMarker(c.patientMedicalFlags),
    remaining: c.remaining,
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
