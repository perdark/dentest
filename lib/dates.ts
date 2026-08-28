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

/** Split "YYYY-MM-DD" into numbers, or null when it is not a real ISO date. */
function partsOfISO(iso: string): { y: number; m: number; d: number } | null {
  const parts = iso.slice(0, 10).split("-");
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map(Number);
  if (!y || !m || m < 1 || m > 12 || !d || d < 1 || d > 31) return null;
  return { y, m, d };
}

/**
 * "2026-08-30" -> "8/30" — the dense form for table cells, calendar headers,
 * list rows and chips. No leading zeros. Returns input unchanged if unparsable.
 *
 * The clinic asked for numeric dates over spelled-out month names (2026-08-24).
 * Storage never changes: the DB stays "YYYY-MM-DD" — this is display only.
 * The output is Western digits, so every caller wraps it in the `dir="ltr"` +
 * `tabular-nums` span this codebase already uses for numbers inside RTL text.
 */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const p = partsOfISO(iso);
  return p ? `${p.m}/${p.d}` : iso;
}

/**
 * "2026-08-30" -> "8/30/2026" — the same numeric form carrying its year, for
 * screens where no month header or period selector already names it.
 */
export function formatDateShortY(iso: string | null | undefined): string {
  if (!iso) return "";
  const p = partsOfISO(iso);
  return p ? `${p.m}/${p.d}/${p.y}` : iso;
}

/**
 * 24-hour "HH:MM" -> 12-hour "2:30 م" ("08:00" -> "8:00 ص", "00:15" -> "12:15 ص").
 * Hour is not zero-padded; minutes always two digits. Returns "" for empty and
 * the input unchanged if unparsable.
 *
 * Iraqi clinics speak in 12-hour time — 24-hour reads as foreign and technical.
 * The stored value and `isValidTime` stay 24-hour; only the screen changes.
 */
export function formatTime12(hhmm: string | null | undefined): string {
  if (!hhmm) return "";
  const value = hhmm.slice(0, 5);
  if (!/^\d{1,2}:\d{2}$/.test(value)) return hhmm;
  const [h, m] = value.split(":").map(Number);
  if (h > 23 || m > 59) return hhmm;
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h < 12 ? "ص" : "م"}`;
}

/** "2026-06" -> "حزيران 2026". */
export function formatPeriodAr(period: string | null | undefined): string {
  if (!period) return "";
  const [y, m] = period.split("-").map(Number);
  if (!m || m < 1 || m > 12) return period;
  return `${AR_MONTHS[m - 1]} ${y}`;
}

/** Shift a "YYYY-MM" period by delta months. */
export function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** Shift a "YYYY-MM-DD" date by delta days. */
export function shiftISOByDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Start of the Iraq work week (Saturday) containing `iso`. */
export function startOfWeekISO(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const daysSinceSaturday = (d.getUTCDay() + 1) % 7;
  return shiftISOByDays(iso, -daysSinceSaturday);
}

/** Shift a "YYYY-MM-DD" date by delta months, clamping to the target month's last day. */
export function shiftISOByMonths(iso: string, delta: number): string {
  const [y, m, day] = iso.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1 + delta + 1, 0)).getUTCDate();
  const d = new Date(Date.UTC(y, m - 1 + delta, Math.min(day, lastDay)));
  return d.toISOString().slice(0, 10);
}

/** Validate a YYYY-MM-DD string. */
export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const parsed = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === s;
}

/** Validate a 24-hour appointment time from a native time input. */
export function isValidTime(s: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(s)) return false;
  const [hours, minutes] = s.split(":").map(Number);
  return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60;
}
