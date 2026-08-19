"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { paymentFailureMessage, recordCasePayment } from "@/lib/mutations";
import { parseAmount } from "@/lib/format";
import { todayISO, isValidISODate } from "@/lib/dates";
import { requireAuth } from "@/lib/auth";

export type PayState = { ok?: boolean; error?: string };

// ── إضافة دفعة لدين قائم (جلسة) ───────────────────────────────────────────────
const schema = z.object({
  caseId: z.coerce.number().int().positive(),
  amount: z.string().trim().min(1, "أدخل المبلغ"),
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
    kind: "session",
    paidDate: date,
  });
  if (!result.ok) return { error: paymentFailureMessage(result.reason) };

  revalidatePath("/debts");
  revalidatePath("/daily");
  revalidatePath("/dashboard");
  return { ok: true };
}
