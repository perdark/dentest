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
