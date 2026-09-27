import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq, sql } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

/*
 * Correcting a record entered by mistake (2026-09-27): edit / delete of
 * payments, cases, patients, appointments and cash movements. Money must stay
 * consistent — every edit keeps the same caps a fresh entry has, and every
 * closed month the change touches goes stale [D4].
 */

const testDir = mkdtempSync(path.join(tmpdir(), "zuha-corrections-"));
process.env.ZUHA_DB = path.join(testDir, "corrections.db");

let dbClient: typeof import("@/lib/db/client");
let schema: typeof import("@/lib/db/schema");
let m: typeof import("@/lib/mutations");
let drA: number;
let drB: number;
let fillingType: number;
let orthoType: number;

before(async () => {
  dbClient = await import("@/lib/db/client");
  schema = await import("@/lib/db/schema");
  m = await import("@/lib/mutations");
  migrate(dbClient.db, { migrationsFolder: path.resolve("drizzle") });

  const id = (r: { lastInsertRowid: number | bigint }) => Number(r.lastInsertRowid);
  drA = id(dbClient.db.insert(schema.doctors).values({ name: "د. أ" }).run());
  drB = id(dbClient.db.insert(schema.doctors).values({ name: "د. ب" }).run());
  fillingType = id(dbClient.db.insert(schema.treatmentTypes).values({
    key: "filling_t",
    nameAr: "حشوة",
    nameEn: "Filling",
    settlementBucket: "normal",
  }).run());
  orthoType = id(dbClient.db.insert(schema.treatmentTypes).values({
    key: "ortho_t",
    nameAr: "تقويم",
    nameEn: "Ortho",
    settlementBucket: "ortho",
    isOrtho: true,
  }).run());
});

beforeEach(() => {
  const d = dbClient.db;
  d.delete(schema.payments).run();
  d.delete(schema.caseTeeth).run();
  d.delete(schema.appointments).run();
  d.delete(schema.cases).run();
  d.delete(schema.labEntries).run();
  d.delete(schema.patients).run();
  d.delete(schema.cashMovements).run();
  d.delete(schema.monthlySettlements).run();
  d.delete(schema.auditLog).run();
});

after(() => {
  dbClient.sqlite.close();
  rmSync(testDir, { recursive: true, force: true });
});

function openCase(total: number, opts: { doctorId?: number; date?: string; type?: number } = {}) {
  const patientId = m.createPatient({ fullName: "مريض اختبار" });
  const caseId = m.createCase({
    patientId,
    doctorId: opts.doctorId ?? drA,
    treatmentTypeId: opts.type ?? fillingType,
    openedDate: opts.date ?? "2026-07-10",
    listPrice: total,
    discount: 0,
    totalPrice: total,
  });
  return { patientId, caseId };
}

function pay(caseId: number, amount: number, date = "2026-07-10", kind: "session" | "refund" = "session") {
  const r = m.recordCasePayment({ caseId, amount, paidDate: date, kind });
  assert.ok(r.ok, `payment refused: ${JSON.stringify(r)}`);
  return r.paymentId;
}

function closeMonth(period: string, doctorId = drA) {
  dbClient.db
    .insert(schema.monthlySettlements)
    .values({ period, doctorId, status: "closed", closedAt: Date.now() })
    .run();
}

function statusOf(period: string) {
  return dbClient.db
    .select({ s: schema.monthlySettlements.status })
    .from(schema.monthlySettlements)
    .where(eq(schema.monthlySettlements.period, period))
    .get()?.s;
}

const count = (t: SQLiteTable) =>
  dbClient.db.select({ v: sql<number>`count(*)` }).from(t).get()!.v;

// ── Payments ────────────────────────────────────────────────────────────────
test("editing a payment keeps the case cap, measured against the other payments", () => {
  const { caseId } = openCase(100_000);
  pay(caseId, 40_000);
  const second = pay(caseId, 30_000);

  const over = m.updatePayment(second, { amount: 70_000, paidDate: "2026-07-10", note: null });
  assert.deepEqual(over, { ok: false, reason: "exceeds_remaining" });

  const ok = m.updatePayment(second, { amount: 60_000, paidDate: "2026-07-11", note: "صُحّح" });
  assert.deepEqual(ok, { ok: true });
  const row = dbClient.db.select().from(schema.payments).where(eq(schema.payments.id, second)).get()!;
  assert.equal(row.amount, 60_000);
  assert.equal(row.paidDate, "2026-07-11");
  assert.equal(row.note, "صُحّح");
});

test("a refund keeps its negative sign and cannot exceed what the others paid", () => {
  const { caseId } = openCase(100_000);
  pay(caseId, 50_000);
  const refund = pay(caseId, 10_000, "2026-07-12", "refund");

  assert.deepEqual(
    m.updatePayment(refund, { amount: 60_000, paidDate: "2026-07-12", note: null }),
    { ok: false, reason: "refund_exceeds_paid" },
  );
  assert.deepEqual(m.updatePayment(refund, { amount: 20_000, paidDate: "2026-07-12", note: null }), { ok: true });
  const row = dbClient.db.select().from(schema.payments).where(eq(schema.payments.id, refund)).get()!;
  assert.equal(row.amount, -20_000);
});

test("a payment cannot be lowered under what was already refunded", () => {
  const { caseId } = openCase(100_000);
  const p = pay(caseId, 50_000);
  pay(caseId, 30_000, "2026-07-12", "refund");
  assert.deepEqual(
    m.updatePayment(p, { amount: 20_000, paidDate: "2026-07-10", note: null }),
    { ok: false, reason: "below_refunds" },
  );
});

test("moving a payment out of a closed month stales both months", () => {
  const { caseId } = openCase(100_000, { date: "2026-06-05" });
  const p = pay(caseId, 40_000, "2026-06-05");
  closeMonth("2026-06");
  closeMonth("2026-07", drB);

  assert.deepEqual(m.updatePayment(p, { amount: 40_000, paidDate: "2026-07-01", note: null }), { ok: true });
  assert.equal(statusOf("2026-06"), "stale");
  assert.equal(statusOf("2026-07"), "stale");
});

test("a future payment date is refused", () => {
  const { caseId } = openCase(100_000);
  const p = pay(caseId, 10_000);
  assert.deepEqual(
    m.updatePayment(p, { amount: 10_000, paidDate: "2099-01-01", note: null }),
    { ok: false, reason: "future_date" },
  );
});

// ── Cases ───────────────────────────────────────────────────────────────────
test("changing a case's doctor moves the payments credited to the old one", () => {
  const { caseId } = openCase(100_000);
  const p = pay(caseId, 40_000);
  const r = m.updateCaseRecord(caseId, {
    doctorId: drB,
    treatmentTypeId: fillingType,
    openedDate: "2026-07-10",
    listPrice: 100_000,
    discount: 0,
    notes: null,
  });
  assert.deepEqual(r, { ok: true });
  const row = dbClient.db.select().from(schema.payments).where(eq(schema.payments.id, p)).get()!;
  assert.equal(row.doctorId, drB);
});

test("a case total cannot drop under what was paid, and ortho is refused", () => {
  const { caseId } = openCase(100_000);
  pay(caseId, 80_000);
  const base = { doctorId: drA, treatmentTypeId: fillingType, openedDate: "2026-07-10", notes: null };
  assert.deepEqual(
    m.updateCaseRecord(caseId, { ...base, listPrice: 100_000, discount: 30_000 }),
    { ok: false, reason: "below_paid" },
  );
  const updated = m.updateCaseRecord(caseId, { ...base, listPrice: 100_000, discount: 20_000 });
  assert.deepEqual(updated, { ok: true });
  const c = dbClient.db.select().from(schema.cases).where(eq(schema.cases.id, caseId)).get()!;
  assert.equal(c.totalPrice, 80_000);

  const ortho = openCase(0, { type: orthoType });
  assert.deepEqual(
    m.updateCaseRecord(ortho.caseId, { ...base, listPrice: 0, discount: 0 }),
    { ok: false, reason: "not_ordinary" },
  );
});

test("deleting a case takes its payments and teeth, and stales the closed month", () => {
  const { caseId } = openCase(100_000);
  pay(caseId, 40_000);
  m.setCaseTeeth(caseId, [{ scope: "tooth", toothCode: 11 }]);
  closeMonth("2026-07");

  const r = m.deleteCaseCascade(caseId);
  assert.deepEqual(r, { payments: 1, paymentsTotal: 40_000 });
  assert.equal(count(schema.payments), 0);
  assert.equal(count(schema.caseTeeth), 0);
  assert.equal(count(schema.cases), 0);
  assert.equal(statusOf("2026-07"), "stale");
});

// ── Patients ────────────────────────────────────────────────────────────────
test("deleting a patient removes cases, payments and appointments; lab money stays", () => {
  const { patientId, caseId } = openCase(100_000);
  pay(caseId, 40_000);
  m.createAppointment({ patientId, apptDate: "2026-10-01" });
  const labId = m.addLabEntry({
    doctorId: drA,
    branch: "fixed",
    entryDate: "2026-07-10",
    amount: 15_000,
    patientId,
  });
  closeMonth("2026-08");

  const r = m.deletePatientCascade(patientId);
  assert.deepEqual(r, { cases: 1, payments: 1, appointments: 1 });
  assert.equal(count(schema.patients), 0);
  assert.equal(count(schema.cases), 0);
  assert.equal(count(schema.payments), 0);
  assert.equal(count(schema.appointments), 0);
  const lab = dbClient.db.select().from(schema.labEntries).where(eq(schema.labEntries.id, labId)).get()!;
  assert.equal(lab.patientId, null);
  assert.equal(lab.amount, 15_000);
  // Nothing in August was touched — only July payments were.
  assert.equal(statusOf("2026-08"), "closed");
  // Every removed row is still readable in the audit log.
  const deletes = dbClient.db
    .select({ v: sql<number>`count(*)` })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.action, "delete"))
    .get()!.v;
  assert.equal(deletes, 4); // payment, case, appointment, patient
});

// ── Appointments & cash ─────────────────────────────────────────────────────
test("an appointment can be moved to another day and doctor", () => {
  const patientId = m.createPatient({ fullName: "مراجع" });
  const id = m.createAppointment({ patientId, apptDate: "2026-10-01", apptTime: "10:00" });
  assert.equal(
    m.updateAppointment(id, { doctorId: drB, apptDate: "2026-10-03", apptTime: null, note: "نُقل" }),
    true,
  );
  const a = dbClient.db.select().from(schema.appointments).where(eq(schema.appointments.id, id)).get()!;
  assert.equal(a.apptDate, "2026-10-03");
  assert.equal(a.doctorId, drB);
  assert.equal(a.apptTime, null);
});

test("a cash movement can be deleted, a doctor's payout cannot", () => {
  const draw = m.recordCashMovement({ moveDate: "2026-07-10", type: "owner_draw", amount: -50_000 });
  const payout = m.recordCashMovement({
    moveDate: "2026-07-10",
    type: "payout",
    amount: -200_000,
    refTable: "monthly_settlements",
    refId: 1,
  });
  assert.equal(m.deleteCashMovement(payout), "payout");
  assert.equal(m.deleteCashMovement(draw), "ok");
  assert.equal(m.deleteCashMovement(draw), "not_found");
  assert.equal(count(schema.cashMovements), 1);
});
