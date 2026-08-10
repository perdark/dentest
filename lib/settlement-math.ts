export interface PayoutFormulaInput {
  collectedTotal: number;
  labCost: number;
  commissionPct: number;
  labDeductedPerDoctor: boolean;
  pctAppliedAfterLab: boolean;
}

/**
 * The doctor's share before clamping. May be NEGATIVE when the lab deduction is
 * on and the lab cost of cases opened this month exceeds what was collected —
 * see `payoutShortfall`. [A6]
 */
export function rawDoctorPayout(input: PayoutFormulaInput): number {
  const { collectedTotal, labCost, commissionPct } = input;
  if (input.labDeductedPerDoctor && input.pctAppliedAfterLab) {
    return Math.round((collectedTotal - labCost) * (commissionPct / 100));
  }
  if (input.labDeductedPerDoctor) {
    return Math.round(collectedTotal * (commissionPct / 100)) - labCost;
  }
  return Math.round(collectedTotal * (commissionPct / 100));
}

/**
 * Keep browser previews and server snapshots on the same integer formula.
 * Never returns a negative: a negative share would silently *increase* clinic
 * net (the clinic would appear to profit from the doctor's shortfall). The
 * uncovered amount is reported separately by `payoutShortfall` so the office
 * can settle it by hand. [A6]
 */
export function calculateDoctorPayout(input: PayoutFormulaInput): number {
  return Math.max(0, rawDoctorPayout(input));
}

/** Amount by which lab cost exceeded the doctor's share this month (0 if none). */
export function payoutShortfall(input: PayoutFormulaInput): number {
  return Math.max(0, -rawDoctorPayout(input));
}

/**
 * Clamp a user-entered commission percentage. A blank or non-numeric entry
 * means "not set" and falls back — it must NOT read as 0%. [A5]
 */
export function normalizeCommissionPct(
  value: string | number | null | undefined,
  fallback: number,
): number {
  if (value == null) return fallback;
  const raw = typeof value === "string" ? value.trim() : value;
  if (raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}
