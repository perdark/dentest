/**
 * One written form for comparing Arabic names typed by hand. [2026-10-28]
 *
 * The clinic types the same word several ways — «زراعة» / «زراعه», «سبأ» /
 * «سبا», «حشوة» / «حشوه». Comparing the raw strings let «زراعه» (with ه) slip
 * past the guard that sends implants to their own register, and split one
 * patient into two files. This folds the spellings that mean the same word:
 *
 *  - أ إ آ ٱ → ا      ة → ه      ى → ي
 *  - drops tashkeel and tatweel (ـ)
 *  - collapses whitespace, lower-cases Latin
 *
 * For comparison only — never written back over what the clerk typed.
 */
export function normalizeArabic(value: string): string {
  return value
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * A payment on an earlier account typed into the treatment field — «توصيل
 * مبلغ», «توصيل دين», «قسط ماستر». Opened as a new case it counts the money as
 * new work and leaves the original balance owing forever: 37 such cases were
 * in the clinic's records by 2026-10-25. Unlike «تقويم» inside «تنظيف تقويمي»,
 * these phrases never name a treatment, so matching inside the name is safe.
 *
 * Takes a FOLDED name (`normalizeArabic`). Also read by «الدفتر اليومي» to
 * file such a line under «توصيل مبلغ» on the owner's card. [2026-11-15]
 */
export function isPaymentPhrase(folded: string): boolean {
  return (
    folded.includes("توصيل مبلغ") ||
    folded.includes("توصيل دين") ||
    folded.includes("تسديد") ||
    folded.startsWith("قسط") ||
    folded === "دفعه" ||
    folded === "مبلغ"
  );
}
