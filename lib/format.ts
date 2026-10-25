// Money + number formatting. All amounts are integer Iraqi Dinars.

const nf = new Intl.NumberFormat("en-US");

/** "12,500,000 د.ع" — Western digits for unambiguous accounting. */
export function formatIQD(amount: number | null | undefined): string {
  const n = amount ?? 0;
  return `${nf.format(n)} د.ع`;
}

/** Plain grouped number, no currency suffix. */
export function formatNumber(amount: number | null | undefined): string {
  return nf.format(amount ?? 0);
}

// `formatIQDShort` abbreviated dashboard figures as "12.5M د.ع". No screen
// ever used it: the clinic reads exact dinars everywhere, and an abbreviated
// total on a money screen is a rounding the owner cannot check. Removed
// 2026-09-22.

/** Parse user input ("12,500,000" / "12.5m") to an integer dinar amount. */
export function parseAmount(input: string | number | null | undefined): number {
  if (input == null) return 0;
  if (typeof input === "number") return Math.round(input);
  let s = normalizeDigits(String(input)).trim().replace(/[,٬\s]/g, "").replace(/د\.?ع/g, "");
  if (!s) return 0;
  let mult = 1;
  const m = s.match(/([0-9.]+)\s*([mMkK])$/);
  if (m) {
    s = m[1];
    mult = /[mM]/.test(m[2]) ? 1_000_000 : 1_000;
  }
  const v = Number(s);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * mult);
}

/** «٠١٢٣٤٥٦٧٨٩» / «۰۱۲…» → ASCII, so an Arabic keyboard types real amounts. */
function normalizeDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * True only when the clerk actually typed zero («0», «٠», «0 د.ع»).
 *
 * `parseAmount` answers 0 for anything it cannot read, so «0» alone cannot
 * tell a free session from a typo. A free session is recorded only on this.
 */
export function isExplicitZero(input: string | null | undefined): boolean {
  if (input == null) return false;
  const s = normalizeDigits(String(input)).trim().replace(/[,٬\s]/g, "").replace(/د\.?ع/g, "");
  return /^0+$/.test(s);
}
