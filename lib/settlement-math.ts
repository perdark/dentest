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

// ── Assistants (أجرهم من حصة الطبيب) [قرار العيادة 2026-10-28] ──────────────
export interface AssistantPayInput {
  payMode: "salary" | "percent";
  /** IQD per month (salary mode). */
  salary: number;
  /** % of the doctor's share (percent mode). */
  pct: number;
}

/**
 * One assistant's pay for the month. Both modes are taken from the doctor's
 * share: a salary is that fixed amount, a percentage is `pct`% of the share
 * the doctor earned (after his own % and any lab deduction) — never of the
 * gross collected.
 */
export function assistantPay(doctorShare: number, a: AssistantPayInput): number {
  if (a.payMode === "salary") return Math.max(0, a.salary);
  return Math.round((Math.max(0, doctorShare) * a.pct) / 100);
}

/**
 * Split a doctor's share between him and his assistants. The assistants are
 * always paid in full; the doctor gets what is left, never below zero. When
 * the assistants cost more than the share (a salary in a quiet month, or an
 * owner at 0%), the difference is `shortfall`: the clinic paid it, and for a
 * hired doctor it is settled by hand like a lab shortfall. [A6]
 */
export function splitDoctorShare(
  doctorShare: number,
  assistantAmounts: number[],
): { net: number; assistantsTotal: number; shortfall: number } {
  const assistantsTotal = assistantAmounts.reduce((sum, v) => sum + v, 0);
  return {
    net: Math.max(0, doctorShare - assistantsTotal),
    assistantsTotal,
    shortfall: Math.max(0, assistantsTotal - doctorShare),
  };
}

/** Does an assistant working `startDate`..`endDate` count in `period` (YYYY-MM)? */
export function assistantWorksIn(
  period: string,
  startDate: string,
  endDate: string | null,
): boolean {
  return startDate.slice(0, 7) <= period && (endDate === null || endDate.slice(0, 7) >= period);
}
