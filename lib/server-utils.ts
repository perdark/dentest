import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, sqlite } from "@/lib/db";
import {
  auditLog,
  cashMovements,
  counters,
  expenses,
  monthlySettlements,
  payments,
  settings,
  type Settings,
} from "@/lib/db/schema";

/** Read the single settings row, creating a bare one if missing. */
export function getSettings(): Settings {
  let row = db.select().from(settings).where(eq(settings.id, 1)).get();
  if (!row) {
    db.insert(settings).values({ id: 1 }).onConflictDoNothing().run();
    row = db.select().from(settings).where(eq(settings.id, 1)).get()!;
  }
  return row;
}

/** Atomically allocate the next value of a named counter. */
export const nextCounter = sqlite.transaction((name: string): number => {
  db.insert(counters).values({ name, value: 0 }).onConflictDoNothing().run();
  db.update(counters)
    .set({ value: sql`${counters.value} + 1` })
    .where(eq(counters.name, name))
    .run();
  return db.select().from(counters).where(eq(counters.name, name)).get()!.value;
}) as unknown as (name: string) => number;

/** True if a settlement for this period has been closed. */
export function isPeriodClosed(period: string): boolean {
  const row = db
    .select({ id: monthlySettlements.id })
    .from(monthlySettlements)
    .where(and(eq(monthlySettlements.period, period), eq(monthlySettlements.status, "closed")))
    .get();
  return !!row;
}

/** Demote any closed settlement in a period to "stale". [D4] */
export function markPeriodStale(period: string): void {
  db.update(monthlySettlements)
    .set({ status: "stale", updatedAt: Date.now() })
    .where(and(eq(monthlySettlements.period, period), eq(monthlySettlements.status, "closed")))
    .run();
}

export interface AuditEntry {
  entity: string;
  entityId?: number;
  action: "insert" | "update" | "delete";
  before?: unknown;
  after?: unknown;
  period?: string;
  note?: string;
  /**
   * Whether hitting a closed period should mark that month's settlement stale.
   * Defaults to true and must stay true for anything that moves clinic money.
   *
   * The one exception is lab entries: that money is tracked outside the payout
   * entirely, so a lab bill recorded late against a closed month changes no
   * doctor's share and must not ask the clinic to re-open a settled month.
   * The audit row is still written and still flagged `hitClosedPeriod`. [D4]
   */
  markStale?: boolean;
}

/**
 * Record an edit in the audit log; if it touches a closed period, flag it and
 * mark that period's settlement stale. Returns true if a closed period was hit.
 * [D4] Call from any payment/expense create/update/delete.
 */
export function recordEdit(e: AuditEntry): boolean {
  const closed = e.period ? isPeriodClosed(e.period) : false;
  db.insert(auditLog)
    .values({
      entity: e.entity,
      entityId: e.entityId,
      action: e.action,
      beforeJson: e.before === undefined ? null : JSON.stringify(e.before),
      afterJson: e.after === undefined ? null : JSON.stringify(e.after),
      period: e.period ?? null,
      hitClosedPeriod: closed,
      note: e.note ?? null,
    })
    .run();
  if (closed && e.period && e.markStale !== false) markPeriodStale(e.period);
  return closed;
}

/**
 * Cash on hand [D8] = opening balance + all payments (refunds are negative)
 * − all expenses + signed cash movements (reserves/withdrawals/payouts are
 * negative). Pure derivation; the system never moves money itself.
 */
export function cashOnHand(): number {
  const s = getSettings();
  const pay =
    db.select({ v: sql<number>`coalesce(sum(${payments.amount}),0)` }).from(payments).get()?.v ?? 0;
  const exp =
    db.select({ v: sql<number>`coalesce(sum(${expenses.amount}),0)` }).from(expenses).get()?.v ?? 0;
  const mov =
    db
      .select({ v: sql<number>`coalesce(sum(${cashMovements.amount}),0)` })
      .from(cashMovements)
      .get()?.v ?? 0;
  return s.openingCashBalance + pay - exp + mov;
}
