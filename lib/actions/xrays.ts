"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  deleteXrayFilm,
  recordXrayFilm,
  xrayFilmFailureMessage,
} from "@/lib/mutations";
import { parseAmount } from "@/lib/format";
import { isRecordableDate, todayISO } from "@/lib/dates";
import { requireAuth } from "@/lib/auth";

export type XrayFormState = { ok?: boolean; error?: string };

function revalidateXrays() {
  revalidatePath("/xrays");
  // الفيلم نقدٌ في الدرج بتاريخه، فيتحرّك معه الدفتر اليومي والصندوق والحصيلة.
  revalidatePath("/daily");
  revalidatePath("/dashboard");
  revalidatePath("/settlement");
}

const recordSchema = z.object({
  treatmentTypeId: z.coerce.number().int().positive("اختر نوع الأشعة"),
  placement: z.enum(["internal", "external"]).default("internal"),
  price: z.string().optional().default(""),
  date: z.string().optional().default(""),
});

/**
 * تسجيل صورة أشعة: النوع، وداخل أم خارج، والسعر. [قرار العيادة 2026-08-25]
 *
 * بلا مريض وبلا طبيب وبلا دفعات: الصورة بيع نقدي في لحظته، وسعرها هو دخل
 * العيادة بتاريخه. المبلغ يُقرأ على الخادم بـ`parseAmount` — ما يصل من المتصفح
 * نصٌّ مكتوب لا مبلغ.
 */
export async function recordXrayAction(
  _prev: XrayFormState,
  formData: FormData,
): Promise<XrayFormState> {
  await requireAuth();
  const parsed = recordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "تحقق من البيانات المُدخلة" };
  }
  const d = parsed.data;
  const filmDate = isRecordableDate(d.date) ? d.date : todayISO();

  const price = parseAmount(d.price);
  if (price <= 0) return { error: "أدخل سعراً صحيحاً أكبر من صفر" };

  const result = recordXrayFilm({
    filmDate,
    treatmentTypeId: d.treatmentTypeId,
    placement: d.placement,
    price,
  });
  if (!result.ok) return { error: xrayFilmFailureMessage(result.reason) };

  revalidateXrays();
  return { ok: true };
}

const removeSchema = z.object({ filmId: z.coerce.number().int().positive() });

/** حذف صورة سُجّلت بالخطأ. السطر يبقى كاملاً في «سجل التعديلات». */
export async function removeXrayAction(
  _prev: XrayFormState,
  formData: FormData,
): Promise<XrayFormState> {
  await requireAuth();
  const parsed = removeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "تعذّر تحديد الصورة المطلوب حذفها" };

  if (!deleteXrayFilm(parsed.data.filmId)) {
    return { error: "لم يتم العثور على الصورة." };
  }

  revalidateXrays();
  return { ok: true };
}
