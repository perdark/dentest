"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { ownerEntryFailureMessage, recordOwnerEntry } from "@/lib/mutations";
import { formatIQD, isExplicitZero, parseAmount } from "@/lib/format";
import { requireAuth } from "@/lib/auth";
import { ownerEntryTargets } from "@/lib/queries";
import { formatDateAr } from "@/lib/dates";

export type OwnerEntryState = { ok?: boolean; error?: string };

/**
 * «د. عدي» in «الدفتر اليومي» — the owner's four notebook lines with a name
 * and an amount. All the rules live in `recordOwnerEntry`. [قرار العيادة 2026-11-15]
 */
const schema = z.object({
  kind: z.enum(["work", "delivery", "ortho", "implant"]),
  patientId: z.coerce.number().int().positive().optional(),
  patientName: z.string().optional().default(""),
  phone: z.string().optional(),
  amount: z.string().optional().default(""),
  treatmentName: z.string().optional().default(""),
  price: z.string().optional().default(""),
  // "" or "new" = open a new account.
  caseId: z.string().optional().default(""),
  date: z.string(),
  note: z.string().optional().default(""),
});

export async function saveOwnerEntry(
  _prev: OwnerEntryState,
  formData: FormData,
): Promise<OwnerEntryState> {
  await requireAuth();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "تحقق من الحقول المدخلة" };
  const d = parsed.data;

  const name = d.patientName.trim();
  if (d.patientId === undefined && !name) return { error: "اسم المريض مطلوب" };

  // Normal work may be free («0» written out); every other line is money in.
  const amount = parseAmount(d.amount);
  if (d.kind === "work") {
    if (!d.amount.trim() || (amount <= 0 && !isExplicitZero(d.amount))) {
      return { error: "أدخل المبلغ — أو 0 لعمل بلا دفعة" };
    }
  } else if (amount <= 0) {
    return { error: "أدخل مبلغاً صحيحاً أكبر من صفر" };
  }
  const caseId = /^\d+$/.test(d.caseId) ? Number(d.caseId) : undefined;

  const result = recordOwnerEntry({
    kind: d.kind,
    patient:
      d.patientId !== undefined ? { id: d.patientId } : { fullName: name, phone: d.phone || null },
    amount,
    date: d.date,
    treatmentName: d.treatmentName,
    price: d.price.trim() ? parseAmount(d.price) : undefined,
    caseId,
    note: d.note,
  });
  if (!result.ok) return { error: ownerEntryFailureMessage(result.reason) };

  revalidatePath("/daily");
  revalidatePath("/dashboard");
  revalidatePath("/debts");
  revalidatePath(`/patients/${result.patientId}`);
  revalidatePath("/ortho", "layout");
  revalidatePath("/implants", "layout");
  return { ok: true };
}

export type OwnerTarget = {
  id: number;
  label: string;
};

/** The accounts each button can pay into for one patient. */
export async function ownerTargetsAction(
  patientId: number,
): Promise<Record<"delivery" | "ortho" | "implant", OwnerTarget[]>> {
  await requireAuth();
  if (!Number.isSafeInteger(patientId) || patientId <= 0) {
    return { delivery: [], ortho: [], implant: [] };
  }
  const t = ownerEntryTargets(patientId);
  const fmt = formatIQD;
  return {
    delivery: t.delivery.map((c) => ({
      id: c.id,
      label: `${c.treatment} — المتبقي ${fmt(c.remaining)} — ${c.doctorName}`,
    })),
    ortho: t.ortho.map((c) => ({
      id: c.id,
      label: `حالة تقويم من ${formatDateAr(c.openedDate)} — ${
        c.downPaymentLeft === null
          ? "بلا مقدمة محددة"
          : c.downPaymentLeft > 0
            ? `المتبقي من المقدمة ${fmt(c.downPaymentLeft)}`
            : "المقدمة مكتملة"
      }`,
    })),
    implant: t.implant.map((c) => ({
      id: c.id,
      label: `بطاقة #${c.implantCardNo ?? "—"} — المتبقي ${fmt(c.remaining)}`,
    })),
  };
}
