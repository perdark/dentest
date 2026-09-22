"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { paymentFailureMessage, recordCasePayment } from "@/lib/mutations";
import { parseAmount } from "@/lib/format";
import { todayISO, isRecordableDate } from "@/lib/dates";
import { requireAuth } from "@/lib/auth";

export type PayState = { ok?: boolean; error?: string };

// ── إضافة دفعة لدين قائم ──────────────────────────────────────────────────────
/**
 * The two kinds the clinic can record against an open case. The kind travels
 * to `recordCasePayment`, which owns what each one is allowed to do — a refund
 * is capped at what was actually collected and is stored negative there, never
 * here. [golden rule 1]
 *
 * 🔴 «تسوية» and «مقدمة» were offered here between 2026-09-22 and 2026-09-22
 * and are gone: neither changed what was written, so a «تسوية» meant to write
 * off an over-billing was stored as money in and paid the doctor commission on
 * it. See the note in `app/(app)/debts/pay-dialog.tsx` for the full reasoning.
 * The enum below is what a posted form is checked against, so a stale page
 * posting `kind=adjustment` is refused rather than quietly written as a
 * جلسة — the database column still accepts all four for historic rows.
 */
const PAYMENT_KINDS = ["session", "refund"] as const;

const schema = z.object({
  caseId: z.coerce.number().int().positive(),
  amount: z.string().trim().min(1, "أدخل المبلغ"),
  // A missing or unknown kind is a جلسة — the same default the mutation uses,
  // so an older form that posts no `kind` keeps behaving exactly as it did.
  kind: z.enum(PAYMENT_KINDS).optional().default("session"),
  date: z.string().optional().default(""),
});

export async function recordDebtPayment(
  _prev: PayState,
  formData: FormData,
): Promise<PayState> {
  await requireAuth();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "تحقق من البيانات المُدخلة" };
  }
  const d = parsed.data;

  // المبلغ يُحسب على الخادم — لا نثق بأي قيمة محسوبة في المتصفّح.
  const amount = Math.max(0, parseAmount(d.amount));
  if (amount <= 0) {
    return { error: "أدخل مبلغاً صحيحاً أكبر من صفر" };
  }
  // Coerced to today rather than refused, unlike `createVisitNewCase` which
  // errors on the same input. The difference is what the field means: there the
  // date is chosen (the ledger day being browsed), so silently moving it would
  // hide a real mistake; here it defaults to today and is bounded by `max` in
  // the picker, so anything out of range arrived from a stale page or a pasted
  // value. Either way the money lands inside this month, which was the whole
  // point — a payment dated 2099 left «تحصيل الشهر» and the settlement while
  // still counting in «النقد المتوفر». [2026-09-22]
  const date = d.date && isRecordableDate(d.date) ? d.date : todayISO();

  const result = recordCasePayment({
    caseId: d.caseId,
    amount,
    kind: d.kind,
    paidDate: date,
  });
  if (!result.ok) return { error: paymentFailureMessage(result.reason) };

  revalidatePath("/debts");
  revalidatePath("/daily");
  revalidatePath("/dashboard");
  return { ok: true };
}
