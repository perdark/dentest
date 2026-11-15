import { isPaymentPhrase, normalizeArabic } from "@/lib/arabic";
import { ORTHO_BUCKET } from "@/lib/strings";

/**
 * The owner's paper notebook, as one rule for every screen that reads his
 * money back — «الدفتر اليومي», «الأطباء» and his own page. [قرار العيادة 2026-11-15]
 *
 *  - «عمل عادي»: an ordinary treatment paid the day it was opened.
 *  - «توصيل مبلغ»: money on an ordinary treatment opened on an earlier day, or
 *    a line filed as «توصيل مبلغ» (a debt from the old paper notebook).
 *  - «مقدمة تقويم» / «جلسة تقويم»: ortho, by payment kind.
 *  - «زراعة»: implant card payments.
 *
 * Grouping only: the settlement's buckets and every share are unchanged.
 * X-ray lines are clinic income and belong to none of these. [D9]
 */
export type OwnerKind = "work" | "delivery" | "orthoDown" | "orthoSession" | "implant";

export const OWNER_KIND_LABELS: Record<OwnerKind, string> = {
  work: "عمل عادي",
  delivery: "توصيل مبلغ",
  orthoDown: "مقدمة تقويم",
  orthoSession: "جلسات تقويم",
  implant: "زراعة",
};

export const OWNER_KINDS = Object.keys(OWNER_KIND_LABELS) as OwnerKind[];

export function isDeliveryTreatment(treatment: string): boolean {
  return isPaymentPhrase(normalizeArabic(treatment));
}

export function ownerKind(line: {
  bucket: string;
  kind: string;
  treatment: string;
  caseOpenedDate: string;
  paidDate: string;
}): OwnerKind | null {
  if (line.bucket === "implant") return "implant";
  if (line.bucket === ORTHO_BUCKET) return line.kind === "down_payment" ? "orthoDown" : "orthoSession";
  if (line.bucket !== "normal") return null;
  if (isDeliveryTreatment(line.treatment)) return "delivery";
  return line.caseOpenedDate < line.paidDate ? "delivery" : "work";
}
