"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { deletePayment } from "@/lib/mutations";
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
  return { ok: true };
}
