"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { paymentFailureMessage, recordCasePayment } from "@/lib/mutations";
import { parseAmount } from "@/lib/format";
import { todayISO, isValidISODate } from "@/lib/dates";
import { requireAuth } from "@/lib/auth";

export type PayState = { ok?: boolean; error?: string };

// ── إضافة دفعة لدين قائم ──────────────────────────────────────────────────────
/**
 * The four kinds the clinic can record against an open case. They moved here
 * on 2026-09-22 with «دفعة على علاج سابق»: this screen is now the only way in,
 * and a refund or a تسوية has to stay recordable. The kind travels to
 * `recordCasePayment`, which owns what each one is allowed to do — a refund is
 * capped at what was actually collected and is stored negative there, never
 * here. [golden rule 1]
 */
const PAYMENT_KINDS = ["session", "down_payment", "adjustment", "refund"] as const;

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
  const date = d.date && isValidISODate(d.date) ? d.date : todayISO();

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
