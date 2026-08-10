// Business dates are local "YYYY-MM-DD"; periods are "YYYY-MM".

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local (not UTC) date as YYYY-MM-DD. */
export function todayISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD" -> "YYYY-MM". */
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

/** Current period "YYYY-MM". */
export function currentPeriod(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

const AR_MONTHS = [
  "كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران",
  "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول",
];

/** "2026-06-30" -> "30 حزيران 2026". Returns input unchanged if unparsable. */
export function formatDateAr(iso: string | null | undefined): string {
  if (!iso) return "";
  const parts = iso.slice(0, 10).split("-");
  if (parts.length !== 3) return iso;
  const [y, m, day] = parts.map(Number);
  if (!m || m < 1 || m > 12) return iso;
  return `${day} ${AR_MONTHS[m - 1]} ${y}`;
}

/** "2026-06" -> "حزيران 2026". */
export function formatPeriodAr(period: string | null | undefined): string {
  if (!period) return "";
  const [y, m] = period.split("-").map(Number);
  if (!m || m < 1 || m > 12) return period;
  return `${AR_MONTHS[m - 1]} ${y}`;
}

/** Validate a YYYY-MM-DD string. */
export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const parsed = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === s;
}
