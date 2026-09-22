"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  closeSettlement,
  computeSettlement,
  reopenSettlement,
  finalizeSettlementPayout,
} from "@/lib/settlement";
import { requireAuth } from "@/lib/auth";
import { todayISO, isRecordableDate } from "@/lib/dates";

const PERIOD_RE = /^\d{4}-\d{2}$/;

const periodSchema = z.object({ period: z.string().regex(PERIOD_RE, "شهر غير صالح") });

function revalidateSettlement() {
  revalidatePath("/settlement");
  revalidatePath("/dashboard");
}

export type CloseState = { ok?: boolean; error?: string };

// ── إقفال الشهر ───────────────────────────────────────────────────────────────
// يقرأ الشهر ونِسَب كل طبيب (pct_<id>) ثم يحسب ويُجمّد على الخادم. [D3][D4]
export async function closeMonth(
  _prev: CloseState,
  formData: FormData,
): Promise<CloseState> {
  await requireAuth();
  const parsed = periodSchema.safeParse({ period: formData.get("period") });
  if (!parsed.success) return { error: "شهر غير صالح" };
  const period = parsed.data.period;

  // تُجمَّع النِّسَب في خريطة تجاوزات {معرّف الطبيب: نسبة}.
  // الحقل الفارغ يعني «غير محدّدة» فيُترك للحساب أن يرجع إلى نسبة الطبيب —
  // ولا يُسجَّل صفراً. [A5]
  const overrides: Record<number, number> = {};
  for (const [key, value] of formData.entries()) {
    const m = /^pct_(\d+)$/.exec(key);
    if (!m) continue;
    const id = Number(m[1]);
    if (!Number.isInteger(id)) continue;
    const raw = String(value).trim();
    if (raw === "") continue;
    const pct = Number(raw);
    if (!Number.isFinite(pct)) continue;
    overrides[id] = Math.min(100, Math.max(0, Math.round(pct)));
  }

  // شهر صُرفت فيه حصة لا يُعاد إقفاله — نُبلّغ بدل أن يبدو الإقفال ناجحاً. [D1]
  if (computeSettlement(period).anyPaid) {
    return { error: "تم صرف حصة في هذا الشهر — لا يمكن إعادة إقفاله." };
  }

  closeSettlement(period, overrides);
  revalidateSettlement();
  return { ok: true };
}

// ── إعادة فتح الشهر ────────────────────────────────────────────────────────────
export async function reopenMonth(
  _prev: CloseState,
  formData: FormData,
): Promise<CloseState> {
  await requireAuth();
  const parsed = periodSchema.safeParse({ period: formData.get("period") });
  if (!parsed.success) return { error: "شهر غير صالح" };

  if (!reopenSettlement(parsed.data.period)) {
    return {
      error: "تعذّرت إعادة الفتح — إمّا أن الشهر غير مُقفل أو صُرفت فيه حصة.",
    };
  }
  revalidateSettlement();
  return { ok: true };
}

// ── صرف حصة طبيب (حركة نقدية صادرة) [D8] ──────────────────────────────────────
export type PayoutState = { ok?: boolean; error?: string };

const paySchema = z.object({
  period: z.string().regex(PERIOD_RE, "شهر غير صالح"),
  doctorId: z.coerce.number().int().positive(),
  date: z.string().optional().default(""),
});

export async function markPaid(
  _prev: PayoutState,
  formData: FormData,
): Promise<PayoutState> {
  await requireAuth();
  const parsed = paySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "تحقّق من البيانات المُدخلة" };
  }
  const d = parsed.data;

  const date = isRecordableDate(d.date) ? d.date : todayISO();
  const result = finalizeSettlementPayout({
    period: d.period,
    doctorId: d.doctorId,
    paidDate: date,
  });
  if (!result.ok) {
    const errors = {
      not_found: "لم يتم العثور على حصيلة الطبيب لهذا الشهر.",
      not_closed: "يجب إقفال الشهر قبل الصرف.",
      already_paid: "تم صرف هذه الحصة مسبقاً.",
      non_positive: "لا توجد حصة موجبة قابلة للصرف.",
    } satisfies Record<typeof result.reason, string>;
    return { error: errors[result.reason] };
  }

  revalidateSettlement();
  return { ok: true };
}
