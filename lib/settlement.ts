import "server-only";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db, sqlite } from "@/lib/db";
import {
  doctors,
  cases,
  payments,
  treatmentTypes,
  expenses,
  monthlySettlements,
  cashMovements,
  assistants,
  assistantSettlements,
} from "@/lib/db/schema";
import { getSettings, recordEdit } from "@/lib/server-utils";
// دخل الأفلام يُقرأ من مكان واحد فقط — لا نسخة ثانية من الجمع هنا.
import { xrayFilmIncomeForPeriod } from "@/lib/queries";
import { formatPeriodAr } from "@/lib/dates";
import { XRAY_BUCKET } from "@/lib/strings";
import {
  assistantPay,
  assistantWorksIn,
  calculateDoctorPayout,
  payoutShortfall,
  splitDoctorShare,
} from "@/lib/settlement-math";

export interface DoctorSettlement {
  doctorId: number;
  doctorName: string;
  isOwner: boolean;
  collectedImplant: number;
  collectedOrtho: number;
  collectedNormal: number;
  collectedTotal: number;
  accruedTotal: number;
  labCost: number;
  commissionPct: number;
  /** The doctor's share before his assistants (his % of what he collected). */
  grossPayout: number;
  /** What his assistants are paid out of that share this month. */
  assistantsTotal: number;
  /**
   * What the doctor is handed: `grossPayout − assistantsTotal`, never below 0.
   * With no assistants this is exactly the share it always was.
   */
  payout: number;
  /** Lab cost not covered by this month's share; settle by hand. [A6] */
  shortfall: number;
  /** Assistant pay not covered by the share — the clinic paid it. */
  assistantsShortfall: number;
  status: "draft" | "closed" | "stale" | "none";
  paidAt: number | null;
}

export interface AssistantSettlementRow {
  assistantId: number;
  name: string;
  doctorId: number;
  doctorName: string;
  doctorIsOwner: boolean;
  payMode: "salary" | "percent";
  pct: number;
  salary: number;
  amount: number;
  /** The doctor's row status — an assistant is closed and paid with it. */
  status: DoctorSettlement["status"];
  paidAt: number | null;
}

export interface SettlementResult {
  period: string;
  doctors: DoctorSettlement[];
  totalCollected: number;
  /** Handed to doctors (net of their assistants). */
  totalPayout: number;
  /** Paid to assistants, out of their doctors' shares. */
  totalAssistants: number;
  assistants: AssistantSettlementRow[];
  /** X-ray cash collected in the period — clinic income, no doctor share. [D9] */
  xrayIncome: number;
  monthExpenses: number;
  clinicNet: number;
  labDeductedPerDoctor: boolean;
  pctAppliedAfterLab: boolean;
  anyClosed: boolean;
  anyStale: boolean;
  anyPaid: boolean;
}

/**
 * Compute the live monthly settlement. [D1] cash-based: collected = net cash
 * received in the period. Refund rows are stored negative and are INCLUDED, so
 * money handed back reduces the doctor's commissionable base — commission is
 * never paid on refunded money. [A2, supersedes the original D5 exclusion.]
 * [D6] lab not deducted per doctor by default. [D3] % = per-month override ??
 * doctor.commissionPct ?? default. [D7] owner (Adi) settled uniformly;
 * clinicNet shown separately.
 *
 * [D9] X-ray money never reaches a doctor. Per-doctor sums ask for the three
 * doctor buckets by name, so the "xray" bucket is excluded by construction; the
 * work-done and lab figures filter it out explicitly for the same reason. The
 * money is not lost — it is reported as the clinic's own income line and added
 * back into clinicNet.
 */
export function computeSettlement(
  period: string,
  overrides: Record<number, number> = {},
): SettlementResult {
  const s = getSettings();
  const docs = db.select().from(doctors).orderBy(doctors.sortOrder).all();

  const periodPay = sql`substr(${payments.paidDate}, 1, 7) = ${period}`;
  const periodOpen = sql`substr(${cases.openedDate}, 1, 7) = ${period}`;

  // Net collected by doctor + bucket. Refund rows are negative, so they net
  // out here and reduce the commissionable base. [A2]
  const collected = db
    .select({
      doctorId: payments.doctorId,
      bucket: treatmentTypes.settlementBucket,
      total: sql<number>`coalesce(sum(${payments.amount}), 0)`,
    })
    .from(payments)
    .innerJoin(cases, eq(payments.caseId, cases.id))
    .innerJoin(treatmentTypes, eq(cases.treatmentTypeId, treatmentTypes.id))
    .where(periodPay)
    .groupBy(payments.doctorId, treatmentTypes.settlementBucket)
    .all();

  // An X-ray is not the doctor's work to be credited with, so it is filtered
  // out of the work-done and lab figures the same way it is out of the
  // collected buckets. [D9]
  const doctorWork = and(
    periodOpen,
    sql`${treatmentTypes.settlementBucket} <> ${XRAY_BUCKET}`,
  );

  // Accrued (work-done) per doctor: cases opened in period at agreed price. [D1]
  const accrued = db
    .select({ doctorId: cases.doctorId, total: sql<number>`coalesce(sum(${cases.totalPrice}),0)` })
    .from(cases)
    .innerJoin(treatmentTypes, eq(cases.treatmentTypeId, treatmentTypes.id))
    .where(doctorWork)
    .groupBy(cases.doctorId)
    .all();

  // Lab per doctor (only used if labDeductedPerDoctor). [D6]
  const lab = db
    .select({ doctorId: cases.doctorId, total: sql<number>`coalesce(sum(${cases.labCost}),0)` })
    .from(cases)
    .innerJoin(treatmentTypes, eq(cases.treatmentTypeId, treatmentTypes.id))
    .where(doctorWork)
    .groupBy(cases.doctorId)
    .all();

  const existing = db
    .select()
    .from(monthlySettlements)
    .where(eq(monthlySettlements.period, period))
    .all();

  const collectedBy = (id: number, bucket: string) =>
    collected.find((c) => c.doctorId === id && c.bucket === bucket)?.total ?? 0;

  // Assistants who worked this month, and what a closed month froze for them.
  const working = db
    .select()
    .from(assistants)
    .orderBy(assistants.id)
    .all()
    .filter((a) => assistantWorksIn(period, a.startDate, a.endDate));
  const frozenAssistants = db
    .select({ row: assistantSettlements, name: assistants.name })
    .from(assistantSettlements)
    .innerJoin(assistants, eq(assistantSettlements.assistantId, assistants.id))
    .where(eq(assistantSettlements.period, period))
    .orderBy(assistantSettlements.assistantId)
    .all();
  const assistantRows: AssistantSettlementRow[] = [];

  const result: DoctorSettlement[] = docs.map((d) => {
    const ex = existing.find((e) => e.doctorId === d.id);
    const isClosed = ex?.status === "closed";
    const cImplant = collectedBy(d.id, "implant");
    const cOrtho = collectedBy(d.id, "ortho");
    const cNormal = collectedBy(d.id, "normal");
    const cTotal = cImplant + cOrtho + cNormal;
    const labCost = s.labDeductedPerDoctor ? lab.find((l) => l.doctorId === d.id)?.total ?? 0 : 0;

    // Closed rows show their snapshot; open rows compute live.
    const pct = isClosed
      ? ex!.commissionPct ?? 0
      : overrides[d.id] ?? d.commissionPct ?? s.defaultCommissionPct;

    // Closed rows report their frozen snapshot; open rows compute live. The
    // shortfall is always derived from the same inputs as the payout. [A6]
    const formula = {
      collectedTotal: isClosed ? ex!.collectedTotal : cTotal,
      labCost: isClosed ? ex!.labCost : labCost,
      commissionPct: pct,
      labDeductedPerDoctor: s.labDeductedPerDoctor,
      pctAppliedAfterLab: s.pctAppliedAfterLab,
    };
    const grossPayout = isClosed ? ex!.grossPayout : calculateDoctorPayout(formula);
    const status = (ex?.status as DoctorSettlement["status"]) ?? "none";

    // A closed month reads the assistants it was closed with; any other month
    // pays whoever works for this doctor in it, at today's figures.
    const mineAssistants = isClosed
      ? frozenAssistants
          .filter((f) => f.row.doctorId === d.id && f.row.status === "closed")
          .map((f) => ({
            assistantId: f.row.assistantId,
            name: f.name,
            payMode: f.row.payMode,
            pct: f.row.pct,
            salary: f.row.salary,
            amount: f.row.amount,
            paidAt: f.row.paidAt,
          }))
      : working
          .filter((a) => a.doctorId === d.id)
          .map((a) => ({
            assistantId: a.id,
            name: a.name,
            payMode: a.payMode,
            pct: a.pct,
            salary: a.salary,
            amount: assistantPay(grossPayout, a),
            paidAt:
              frozenAssistants.find((f) => f.row.assistantId === a.id)?.row.paidAt ?? null,
          }));
    for (const a of mineAssistants) {
      assistantRows.push({
        ...a,
        doctorId: d.id,
        doctorName: d.name,
        doctorIsOwner: d.isOwner,
        status,
      });
    }
    const split = splitDoctorShare(
      grossPayout,
      mineAssistants.map((a) => a.amount),
    );
    // A closed row hands over what it froze; legacy rows (closed before
    // assistants existed) have gross = payout and no assistants, so the two
    // agree. [migration 0011]
    const payout = isClosed ? ex!.payout : split.net;

    return {
      doctorId: d.id,
      doctorName: d.name,
      isOwner: d.isOwner,
      collectedImplant: cImplant,
      collectedOrtho: cOrtho,
      collectedNormal: cNormal,
      collectedTotal: cTotal,
      accruedTotal: accrued.find((a) => a.doctorId === d.id)?.total ?? 0,
      labCost,
      commissionPct: pct,
      grossPayout,
      assistantsTotal: split.assistantsTotal,
      payout,
      shortfall: payoutShortfall(formula),
      assistantsShortfall: split.shortfall,
      status,
      paidAt: ex?.paidAt ?? null,
    };
  });

  const monthExpenses =
    db
      .select({ v: sql<number>`coalesce(sum(${expenses.amount}),0)` })
      .from(expenses)
      .where(sql`substr(${expenses.expenseDate},1,7) = ${period}`)
      .get()?.v ?? 0;

  const totalCollected = result.reduce((s2, r) => s2 + r.collectedTotal, 0);
  const totalPayout = result.reduce((s2, r) => s2 + r.payout, 0);
  const totalAssistants = assistantRows.reduce((s2, a) => s2 + a.amount, 0);

  // Clinic income: collected on the "xray" bucket, which no doctor row above
  // asked for. Read live even for a closed month, exactly like monthExpenses —
  // a snapshot freezes the doctors' shares, not the clinic's own books. [D9]
  const xrayIncome =
    collected
      .filter((c) => c.bucket === XRAY_BUCKET)
      .reduce((s2, c) => s2 + c.total, 0) +
    // الأفلام الجديدة لا سطر دفعة لها — سعرها هو دخلها بتاريخها.
    // [قرار العيادة 2026-08-25]
    xrayFilmIncomeForPeriod(period);

  return {
    period,
    doctors: result,
    totalCollected,
    totalPayout,
    totalAssistants,
    assistants: assistantRows,
    xrayIncome,
    monthExpenses,
    // [D7] salaries=0 (Layer 2). [D9] X-ray income is the clinic's, so it is
    // added whole — no share was taken out of it upstream. Assistants are paid
    // out of their doctors' shares, so doctors + assistants is what leaves the
    // drawer for the shares; it exceeds the shares only where an assistant
    // cost more than his doctor earned, and that excess is the clinic's.
    clinicNet:
      totalCollected + xrayIncome - totalPayout - totalAssistants - monthExpenses,
    labDeductedPerDoctor: s.labDeductedPerDoctor,
    pctAppliedAfterLab: s.pctAppliedAfterLab,
    anyClosed: result.some((r) => r.status === "closed"),
    anyStale: result.some((r) => r.status === "stale"),
    anyPaid:
      result.some((r) => r.paidAt !== null) || assistantRows.some((a) => a.paidAt !== null),
  };
}

/** Snapshot + close the month per doctor. [D3][D4] Freezes %, payout, totals. */
export const closeSettlement = sqlite.transaction(
  (period: string, overrides: Record<number, number> = {}) => {
    const paid = db
      .select({ id: monthlySettlements.id })
      .from(monthlySettlements)
      .where(and(eq(monthlySettlements.period, period), isNotNull(monthlySettlements.paidAt)))
      .get();
    const assistantPaid = db
      .select({ id: assistantSettlements.id })
      .from(assistantSettlements)
      .where(
        and(eq(assistantSettlements.period, period), isNotNull(assistantSettlements.paidAt)),
      )
      .get();
    if (paid || assistantPaid) return computeSettlement(period, overrides);

    const computed = computeSettlement(period, overrides);
    const now = Date.now();
    for (const d of computed.doctors) {
      const before = db
        .select()
        .from(monthlySettlements)
        .where(
          and(
            eq(monthlySettlements.period, period),
            eq(monthlySettlements.doctorId, d.doctorId),
          ),
        )
        .get();
      const snapshot = JSON.stringify(d);
      db.insert(monthlySettlements)
        .values({
          period,
          doctorId: d.doctorId,
          collectedImplant: d.collectedImplant,
          collectedOrtho: d.collectedOrtho,
          collectedNormal: d.collectedNormal,
          collectedTotal: d.collectedTotal,
          accruedTotal: d.accruedTotal,
          labCost: d.labCost,
          commissionPct: d.commissionPct,
          payout: d.payout,
          grossPayout: d.grossPayout,
          assistantsTotal: d.assistantsTotal,
          status: "closed",
          closedAt: now,
          snapshotJson: snapshot,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [monthlySettlements.period, monthlySettlements.doctorId],
          set: {
            collectedImplant: d.collectedImplant,
            collectedOrtho: d.collectedOrtho,
            collectedNormal: d.collectedNormal,
            collectedTotal: d.collectedTotal,
            accruedTotal: d.accruedTotal,
            labCost: d.labCost,
            commissionPct: d.commissionPct,
            payout: d.payout,
            grossPayout: d.grossPayout,
            assistantsTotal: d.assistantsTotal,
            status: "closed",
            closedAt: now,
            snapshotJson: snapshot,
            updatedAt: now,
          },
        })
        .run();
      const after = db
        .select()
        .from(monthlySettlements)
        .where(
          and(
            eq(monthlySettlements.period, period),
            eq(monthlySettlements.doctorId, d.doctorId),
          ),
        )
        .get()!;
      recordEdit({
        entity: "monthly_settlements",
        entityId: after.id,
        action: before ? "update" : "insert",
        before,
        after,
        note: "settlement closed",
      });
    }

    // The assistants are frozen with their doctors. Nothing in the month is
    // paid (checked above), so the month's rows are replaced outright: an
    // assistant stopped or moved since the last close must not linger.
    db.delete(assistantSettlements).where(eq(assistantSettlements.period, period)).run();
    for (const a of computed.assistants) {
      const values = {
        period,
        assistantId: a.assistantId,
        doctorId: a.doctorId,
        payMode: a.payMode,
        pct: a.pct,
        salary: a.salary,
        amount: a.amount,
        status: "closed" as const,
        closedAt: now,
        updatedAt: now,
      };
      const res = db.insert(assistantSettlements).values(values).run();
      recordEdit({
        entity: "assistant_settlements",
        entityId: Number(res.lastInsertRowid),
        action: "insert",
        after: values,
        note: "settlement closed",
      });
    }
    return computed;
  },
) as unknown as (period: string, overrides?: Record<number, number>) => SettlementResult;

/**
 * Reopen a closed/stale month for editing. [D4 escape-hatch]
 * Returns false when a payout has already been paid out in cash — that month
 * is frozen and the caller must say so rather than appear to succeed. [D1]
 */
export const reopenSettlement = sqlite.transaction((period: string): boolean => {
  const beforeRows = db
    .select()
    .from(monthlySettlements)
    .where(eq(monthlySettlements.period, period))
    .all();
  if (beforeRows.length === 0) return false;
  if (beforeRows.some((row) => row.paidAt !== null)) return false;
  const assistantPaid = db
    .select({ id: assistantSettlements.id })
    .from(assistantSettlements)
    .where(
      and(eq(assistantSettlements.period, period), isNotNull(assistantSettlements.paidAt)),
    )
    .get();
  if (assistantPaid) return false;
  db.update(assistantSettlements)
    .set({ status: "draft", closedAt: null, updatedAt: Date.now() })
    .where(eq(assistantSettlements.period, period))
    .run();

  db.update(monthlySettlements)
    .set({ status: "draft", closedAt: null, updatedAt: Date.now() })
    .where(eq(monthlySettlements.period, period))
    .run();
  for (const before of beforeRows) {
    const after = db
      .select()
      .from(monthlySettlements)
      .where(eq(monthlySettlements.id, before.id))
      .get();
    recordEdit({
      entity: "monthly_settlements",
      entityId: before.id,
      action: "update",
      before,
      after,
      note: "settlement reopened",
    });
  }
  return true;
}) as unknown as (period: string) => boolean;

export type SettlementPayoutFailure =
  | "not_found"
  | "not_closed"
  | "already_paid"
  | "non_positive";

export type SettlementPayoutResult =
  | {
      ok: true;
      amount: number;
      settlementId: number;
      cashMovementId: number;
      paidAt: number;
    }
  | { ok: false; reason: SettlementPayoutFailure };

/** Finalize one closed payout and its cash outflow in the same transaction. */
export const finalizeSettlementPayout = sqlite.transaction(
  (input: { period: string; doctorId: number; paidDate: string }): SettlementPayoutResult => {
    const before = db
      .select()
      .from(monthlySettlements)
      .where(
        and(
          eq(monthlySettlements.period, input.period),
          eq(monthlySettlements.doctorId, input.doctorId),
        ),
      )
      .get();

    if (!before) return { ok: false, reason: "not_found" };
    if (before.status !== "closed") return { ok: false, reason: "not_closed" };
    if (before.paidAt !== null) return { ok: false, reason: "already_paid" };
    if (before.payout <= 0) return { ok: false, reason: "non_positive" };

    const paidAt = Date.now();
    const updateResult = db
      .update(monthlySettlements)
      .set({ paidAt, updatedAt: paidAt })
      .where(
        and(
          eq(monthlySettlements.id, before.id),
          eq(monthlySettlements.status, "closed"),
          isNull(monthlySettlements.paidAt),
        ),
      )
      .run();

    if (updateResult.changes !== 1) return { ok: false, reason: "already_paid" };

    const doctor = db.select().from(doctors).where(eq(doctors.id, input.doctorId)).get();
    const movement = {
      moveDate: input.paidDate,
      type: "payout" as const,
      amount: -before.payout,
      refTable: "monthly_settlements",
      refId: before.id,
      note: `صرف حصة ${doctor?.name ?? `#${input.doctorId}`} — ${formatPeriodAr(input.period)}`,
    };
    const movementResult = db.insert(cashMovements).values(movement).run();
    const cashMovementId = Number(movementResult.lastInsertRowid);

    recordEdit({
      entity: "monthly_settlements",
      entityId: before.id,
      action: "update",
      before,
      after: { paidAt },
      note: "settlement payout finalized",
    });
    recordEdit({
      entity: "cash_movements",
      entityId: cashMovementId,
      action: "insert",
      after: movement,
      note: "settlement payout cash outflow",
    });

    return {
      ok: true,
      amount: before.payout,
      settlementId: before.id,
      cashMovementId,
      paidAt,
    };
  },
) as unknown as (input: {
  period: string;
  doctorId: number;
  paidDate: string;
}) => SettlementPayoutResult;

export type AssistantPayoutFailure = SettlementPayoutFailure | "doctor_not_closed";

/**
 * «صرف أجر المساعد» — one closed assistant row and its cash outflow, in one
 * transaction, the same way a doctor's share is paid. Refused while his
 * doctor's month is stale: the frozen figure may no longer be the right one.
 */
export const finalizeAssistantPayout = sqlite.transaction(
  (input: {
    period: string;
    assistantId: number;
    paidDate: string;
  }):
    | { ok: true; amount: number; cashMovementId: number }
    | { ok: false; reason: AssistantPayoutFailure } => {
    const before = db
      .select()
      .from(assistantSettlements)
      .where(
        and(
          eq(assistantSettlements.period, input.period),
          eq(assistantSettlements.assistantId, input.assistantId),
        ),
      )
      .get();
    if (!before) return { ok: false, reason: "not_found" };
    if (before.status !== "closed") return { ok: false, reason: "not_closed" };
    if (before.paidAt !== null) return { ok: false, reason: "already_paid" };
    if (before.amount <= 0) return { ok: false, reason: "non_positive" };
    const doctorRow = db
      .select({ status: monthlySettlements.status })
      .from(monthlySettlements)
      .where(
        and(
          eq(monthlySettlements.period, input.period),
          eq(monthlySettlements.doctorId, before.doctorId),
        ),
      )
      .get();
    if (doctorRow?.status !== "closed") return { ok: false, reason: "doctor_not_closed" };

    const paidAt = Date.now();
    const updated = db
      .update(assistantSettlements)
      .set({ paidAt, updatedAt: paidAt })
      .where(and(eq(assistantSettlements.id, before.id), isNull(assistantSettlements.paidAt)))
      .run();
    if (updated.changes !== 1) return { ok: false, reason: "already_paid" };

    const assistant = db
      .select({ name: assistants.name })
      .from(assistants)
      .where(eq(assistants.id, input.assistantId))
      .get();
    const doctor = db
      .select({ name: doctors.name })
      .from(doctors)
      .where(eq(doctors.id, before.doctorId))
      .get();
    const movement = {
      moveDate: input.paidDate,
      type: "payout" as const,
      amount: -before.amount,
      refTable: "assistant_settlements",
      refId: before.id,
      note: `صرف أجر المساعد ${assistant?.name ?? `#${input.assistantId}`} (${doctor?.name ?? ""}) — ${formatPeriodAr(input.period)}`,
    };
    const movementResult = db.insert(cashMovements).values(movement).run();
    const cashMovementId = Number(movementResult.lastInsertRowid);

    recordEdit({
      entity: "assistant_settlements",
      entityId: before.id,
      action: "update",
      before,
      after: { paidAt },
      note: "assistant payout finalized",
    });
    recordEdit({
      entity: "cash_movements",
      entityId: cashMovementId,
      action: "insert",
      after: movement,
      note: "assistant payout cash outflow",
    });
    return { ok: true, amount: before.amount, cashMovementId };
  },
) as unknown as (input: {
  period: string;
  assistantId: number;
  paidDate: string;
}) =>
  | { ok: true; amount: number; cashMovementId: number }
  | { ok: false; reason: AssistantPayoutFailure };
