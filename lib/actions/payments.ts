"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { deletePayment, updatePayment, paymentEditFailureMessage } from "@/lib/mutations";
import { isExplicitZero, parseAmount } from "@/lib/format";
import { requireAuth } from "@/lib/auth";

export type VoidState = { ok?: boolean; error?: string };

const schema = z.object({ paymentId: z.coerce.number().int().positive() });

/**
 * إلغاء تسجيل دفعة أُدخل بالخطأ. هذا هو المسار الصحيح لتصحيح خطأ إدخال —
 * لا يُستخدم «استرجاع» لأنه حدث مالي حقيقي يُخصم من حصة الطبيب. [A1]
 * التسجيل المحذوف يبقى كاملاً في سجل التعديلات.
 */
export async function voidPayment(
  _prev: VoidState,
  formData: FormData,
): Promise<VoidState> {
  await requireAuth();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "تسجيل غير صالح" };

  const removed = deletePayment(parsed.data.paymentId);
  if (!removed) return { error: "لم يتم العثور على التسجيل؛ ربما أُلغي مسبقاً." };

  revalidatePaymentScreens();
  return { ok: true };
}

function revalidatePaymentScreens() {
  for (const path of [
    "/daily",
    "/debts",
    "/implants",
    "/ortho",
    "/patients",
    "/settlement",
    "/dashboard",
  ]) {
    revalidatePath(path, "layout");
  }
}

// ── تعديل دفعة ───────────────────────────────────────────────────────────────
const editSchema = z.object({
  paymentId: z.coerce.number().int().positive(),
  amount: z.string().trim().min(1, "أدخل المبلغ"),
  paidDate: z.string().trim(),
  note: z.string().trim().max(500).optional().default(""),
  // Ortho only — the dialog sends it there and nowhere else; the mutation
  // refuses it on any other course. [2026-11-04]
  doctorId: z.coerce.number().int().positive().optional(),
});

/**
 * تصحيح مبلغ دفعة أو تاريخها أو ملاحظتها. النوع لا يُعدَّل: النوع الخاطئ يُلغى
 * ويُعاد إدخاله. الطبيب يتبع الحالة، إلا في التقويم: لكل دفعة طبيبها. القيود نفسها التي تحكم إضافة
 * دفعة جديدة تُطبَّق في طبقة البيانات.
 */
export async function updatePaymentAction(
  _prev: VoidState,
  formData: FormData,
): Promise<VoidState> {
  await requireAuth();
  const parsed = editSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "تحقّق من البيانات المُدخلة" };
  }
  const d = parsed.data;
  // صفر يُقبل فقط إذا كُتب صفراً (جلسة مجانية) — لا رقماً تعذّرت قراءته.
  const amount = parseAmount(d.amount);
  if (amount === 0 && !isExplicitZero(d.amount)) {
    return { error: "أدخل مبلغاً صحيحاً" };
  }
  const result = updatePayment(d.paymentId, {
    amount,
    paidDate: d.paidDate,
    note: d.note || null,
    doctorId: d.doctorId,
  });
  if (!result.ok) return { error: paymentEditFailureMessage(result.reason) };

  revalidatePaymentScreens();
  return { ok: true };
}
