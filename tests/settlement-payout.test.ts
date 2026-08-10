import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import {
  calculateDoctorPayout,
  normalizeCommissionPct,
  payoutShortfall,
  rawDoctorPayout,
} from "@/lib/settlement-math";

const testDir = mkdtempSync(path.join(tmpdir(), "dentest-settlement-"));
process.env.DENTEST_DB = path.join(testDir, "settlement.db");

let dbClient: typeof import("@/lib/db/client");
let schema: typeof import("@/lib/db/schema");
let finalizeSettlementPayout: typeof import("@/lib/settlement")["finalizeSettlementPayout"];
let doctorId: number;

before(async () => {
  dbClient = await import("@/lib/db/client");
  schema = await import("@/lib/db/schema");
  const settlement = await import("@/lib/settlement");
  finalizeSettlementPayout = settlement.finalizeSettlementPayout;

  migrate(dbClient.db, { migrationsFolder: path.resolve("drizzle") });
  const doctorResult = dbClient.db
    .insert(schema.doctors)
    .values({ name: "د. اختبار", commissionPct: 50, sortOrder: 1 })
    .run();
  doctorId = Number(doctorResult.lastInsertRowid);
});

function createSettlement(
  period: string,
  payout: number,
  status: "draft" | "closed" | "stale" = "closed",
): number {
  const result = dbClient.db
    .insert(schema.monthlySettlements)
    .values({ period, doctorId, payout, status, closedAt: status === "closed" ? Date.now() : null })
    .run();
  return Number(result.lastInsertRowid);
}

after(() => {
  dbClient.sqlite.close();
  rmSync(testDir, { recursive: true, force: true });
});

test("finalization records one server-derived payout and rejects a duplicate", async () => {
  const settlementId = createSettlement("2026-07", 425_000);

  const first = finalizeSettlementPayout({
    period: "2026-07",
    doctorId,
    paidDate: "2026-07-19",
  });

  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.amount, 425_000);
  assert.equal(first.settlementId, settlementId);

  const movement = dbClient.db
    .select()
    .from(schema.cashMovements)
    .where(eq(schema.cashMovements.id, first.cashMovementId))
    .get();
  assert.equal(movement?.amount, -425_000);
  assert.equal(movement?.refTable, "monthly_settlements");
  assert.equal(movement?.refId, settlementId);

  const duplicate = finalizeSettlementPayout({
    period: "2026-07",
    doctorId,
    paidDate: "2026-07-19",
  });
  assert.deepEqual(duplicate, { ok: false, reason: "already_paid" });
  assert.equal(dbClient.db.select().from(schema.cashMovements).all().length, 1);
});

test("finalization rejects a settlement that is not closed", () => {
  createSettlement("2026-08", 300_000, "draft");

  const result = finalizeSettlementPayout({
    period: "2026-08",
    doctorId,
    paidDate: "2026-08-20",
  });

  assert.deepEqual(result, { ok: false, reason: "not_closed" });
  assert.equal(
    dbClient.db
      .select()
      .from(schema.cashMovements)
      .all()
      .filter((row) => row.refId !== null).length,
    1,
  );
});

test("the shared payout formula covers both laboratory deduction modes", () => {
  assert.equal(
    calculateDoctorPayout({
      collectedTotal: 1_000_000,
      labCost: 200_000,
      commissionPct: 50,
      labDeductedPerDoctor: true,
      pctAppliedAfterLab: true,
    }),
    400_000,
  );
  assert.equal(
    calculateDoctorPayout({
      collectedTotal: 1_000_000,
      labCost: 200_000,
      commissionPct: 50,
      labDeductedPerDoctor: true,
      pctAppliedAfterLab: false,
    }),
    300_000,
  );
});

// A negative share would silently inflate clinic net, so it clamps to zero and
// the uncovered lab cost is reported separately instead. [A6]
test("a lab cost above the doctor's share clamps to zero and reports a shortfall", () => {
  const overrun = {
    collectedTotal: 100_000,
    labCost: 400_000,
    commissionPct: 50,
    labDeductedPerDoctor: true,
    pctAppliedAfterLab: false,
  };
  assert.equal(rawDoctorPayout(overrun), -350_000);
  assert.equal(calculateDoctorPayout(overrun), 0);
  assert.equal(payoutShortfall(overrun), 350_000);

  const healthy = { ...overrun, labCost: 0 };
  assert.equal(calculateDoctorPayout(healthy), 50_000);
  assert.equal(payoutShortfall(healthy), 0);
});

// A blank percentage box means "not set" and must fall back, never read as 0%.
test("a blank commission percentage falls back instead of becoming zero", () => {
  assert.equal(normalizeCommissionPct("", 60), 60);
  assert.equal(normalizeCommissionPct("   ", 60), 60);
  assert.equal(normalizeCommissionPct(null, 60), 60);
  assert.equal(normalizeCommissionPct("abc", 60), 60);
  assert.equal(normalizeCommissionPct("0", 60), 0);
  assert.equal(normalizeCommissionPct("45", 60), 45);
  assert.equal(normalizeCommissionPct("150", 60), 100);
  assert.equal(normalizeCommissionPct("-5", 60), 0);
});

test("an audit failure rolls the settlement and cash movement back together", () => {
  const settlementId = createSettlement("2026-09", 275_000);

  dbClient.sqlite.exec(`
    create trigger fail_payout_audit
    before insert on audit_log
    when new.entity = 'cash_movements'
    begin
      select raise(abort, 'forced audit failure');
    end;
  `);

  assert.throws(
    () =>
      finalizeSettlementPayout({
        period: "2026-09",
        doctorId,
        paidDate: "2026-09-21",
      }),
    /forced audit failure/,
  );

  dbClient.sqlite.exec("drop trigger fail_payout_audit");

  const settlement = dbClient.db
    .select()
    .from(schema.monthlySettlements)
    .where(eq(schema.monthlySettlements.id, settlementId))
    .get();
  assert.equal(settlement?.paidAt, null);
  assert.equal(
    dbClient.db
      .select()
      .from(schema.cashMovements)
      .all()
      .some((row) => row.refId === settlementId),
    false,
  );
  assert.equal(
    dbClient.db
      .select()
      .from(schema.auditLog)
      .all()
      .some((row) => row.entityId === settlementId),
    false,
  );
});
