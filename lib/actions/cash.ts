"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { recordCashMovement } from "@/lib/mutations";
import { parseAmount } from "@/lib/format";
import { todayISO, isValidISODate } from "@/lib/dates";
import { requireAuth } from "@/lib/auth";

export type CashState = { ok?: boolean; error?: string };

// حركات نقدية غير مرتبطة بدفعة مريض: احتياطي، سحب، سحب المالك، تسوية.
// «صرف حصة طبيب» يُسجَّل تلقائياً من شاشة الحصيلة ولا يُدخَل يدوياً هنا. [B2]
const TYPE = z.enum(["reserve", "withdrawal", "owner_draw", "adjustment"]);

const schema = z.object({
  moveDate: z.string().optional().default(""),
  type: TYPE,
  direction: z.enum(["in", "out"]),
  amount: z.string().trim().min(1, "أدخل المبلغ"),
  note: z.string().trim().optional().default(""),
});

export async function addCashMovement(
  _prev: CashState,
  formData: FormData,
): Promise<CashState> {
  await requireAuth();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "تحقّق من البيانات المُدخلة" };
  }
  const d = parsed.data;

  // المبلغ يُحسب على الخادم — دينار عراقي صحيح، والإشارة تُشتقّ من الاتجاه.
  const magnitude = Math.max(0, parseAmount(d.amount));
  if (magnitude <= 0) return { error: "أدخل مبلغاً صحيحاً أكبر من صفر" };

  const moveDate = isValidISODate(d.moveDate) ? d.moveDate : todayISO();

  recordCashMovement({
    moveDate,
    type: d.type,
    amount: d.direction === "out" ? -magnitude : magnitude,
    note: d.note || null,
  });

  revalidatePath("/cash");
  revalidatePath("/dashboard");
  return { ok: true };
}
