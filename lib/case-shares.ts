import { z } from "zod";
import { isExplicitZero, parseAmount } from "@/lib/format";
import type { CaseShareInput } from "@/lib/mutations";

/**
 * «+ طبيب آخر» — the form side of `createSharedCases`. [2026-10-25]
 *
 * With one doctor the forms send `doctorId` / `price` / `discount` / `paidNow`
 * exactly as before and this returns `null`. With two or more, every row sends
 * `shareDoctorId` / `sharePrice` / `sharePaid` (repeated, in row order) and
 * there is no shared discount: the secretary types each doctor's net share.
 *
 * Amounts are parsed here with `parseAmount`; nothing the browser added up is
 * read. A row is refused when it would be refused on its own: no doctor, no
 * price typed (0 is a free session only when 0 was actually typed), a payment
 * larger than its price, or the same doctor twice.
 */
const shareRowSchema = z.object({
  doctorId: z.coerce.number().int().positive("اختر الطبيب في كل سطر"),
  price: z.string().trim().min(1, "اكتب حصة كل طبيب من السعر"),
  paid: z.string().trim().optional().default(""),
});

export type ParsedShares =
  | null
  | { ok: true; shares: CaseShareInput[] }
  | { ok: false; error: string };

export function parseCaseShares(formData: FormData): ParsedShares {
  const doctorIds = formData.getAll("shareDoctorId").map(String);
  if (doctorIds.length === 0) return null;
  const prices = formData.getAll("sharePrice").map(String);
  const paids = formData.getAll("sharePaid").map(String);
  if (prices.length !== doctorIds.length || paids.length !== doctorIds.length) {
    return { ok: false, error: "تحقق من الحقول المدخلة" };
  }

  const shares: CaseShareInput[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < doctorIds.length; i++) {
    const row = shareRowSchema.safeParse({
      doctorId: doctorIds[i],
      price: prices[i],
      paid: paids[i],
    });
    if (!row.success) {
      return { ok: false, error: row.error.issues[0]?.message ?? "تحقق من الحقول المدخلة" };
    }
    const r = row.data;
    if (seen.has(r.doctorId)) {
      return { ok: false, error: "الطبيب نفسه مكرّر — اختر لكل سطر طبيباً مختلفاً" };
    }
    seen.add(r.doctorId);

    const listPrice = parseAmount(r.price);
    const paidNow = parseAmount(r.paid);
    if (listPrice === 0 && !isExplicitZero(r.price)) {
      return { ok: false, error: "اكتب حصة كل طبيب من السعر — 0 يعني جلسة مجانية" };
    }
    if (paidNow === 0 && r.paid !== "" && !isExplicitZero(r.paid)) {
      return { ok: false, error: "تحقق من المبلغ المدفوع في كل سطر" };
    }
    if (listPrice < 0 || paidNow < 0) return { ok: false, error: "المبالغ يجب أن تكون موجبة" };
    if (paidNow > listPrice) {
      return { ok: false, error: "المدفوع من أحد الأطباء أكبر من حصته من السعر" };
    }
    shares.push({ doctorId: r.doctorId, listPrice, discount: 0, paidNow });
  }
  return { ok: true, shares };
}
