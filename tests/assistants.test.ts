import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import {
  assistantPay,
  assistantWorksIn,
  splitDoctorShare,
} from "@/lib/settlement-math";

// المساعدون: أجر كل مساعد يُخصم من حصة طبيبه — راتب ثابت أو نسبة من الحصة.
// [قرار العيادة 2026-10-28]
const testDir = mkdtempSync(path.join(tmpdir(), "zuha-assistants-"));
process.env.ZUHA_DB = path.join(testDir, "assistants.db");

let dbClient: typeof import("@/lib/db/client");
let schema: typeof import("@/lib/db/schema");
let mutations: typeof import("@/lib/mutations");
let settlement: typeof import("@/lib/settlement");
let hired: number;
let owner: number;
let patientId: number;
let normalType: number;

const PERIOD = "2026-07";

before(async () => {
  dbClient = await import("@/lib/db/client");
  schema = await import("@/lib/db/schema");
  mutations = await import("@/lib/mutations");
  settlement = await import("@/lib/settlement");

  migrate(dbClient.db, { migrationsFolder: path.resolve("drizzle") });
  const doctor = (name: string, sortOrder: number, commissionPct: number, isOwner = false) =>
    Number(
      dbClient.db
        .insert(schema.doctors)
        .values({ name, sortOrder, commissionPct, isOwner })
        .run().lastInsertRowid,
    );
  owner = doctor("د. المالك", 1, 0, true);
  hired = doctor("د. موظف", 2, 50);
  patientId = Number(
    dbClient.db.insert(schema.patients).values({ fullName: "مريض" }).run().lastInsertRowid,
  );
  normalType = Number(
    dbClient.db
      .insert(schema.treatmentTypes)
      .values({ key: "filling_t", nameAr: "حشوة", nameEn: "Filling", settlementBucket: "normal" })
      .run().lastInsertRowid,
  );
  // 2,000,000 collected by the hired doctor in July → his 50% share = 1,000,000.
  // 500,000 collected by the owner (0%) → share 0.
  mutations.createCaseWithPayment({
    patientId,
    doctorId: hired,
    treatmentTypeId: normalType,
    openedDate: "2026-07-10",
    listPrice: 2_000_000,
    discount: 0,
    totalPrice: 2_000_000,
    firstPayment: { amount: 2_000_000, kind: "session" },
  });
  mutations.createCaseWithPayment({
    patientId,
    doctorId: owner,
    treatmentTypeId: normalType,
    openedDate: "2026-07-11",
    listPrice: 500_000,
    discount: 0,
    totalPrice: 500_000,
    firstPayment: { amount: 500_000, kind: "session" },
  });
});

after(() => {
  dbClient.sqlite.close();
  rmSync(testDir, { recursive: true, force: true });
});

function row(doctorId: number, period = PERIOD) {
  const r = settlement.computeSettlement(period).doctors.find((d) => d.doctorId === doctorId);
  assert.ok(r);
  return r;
}

test("pay math: salary is fixed, percent is of the doctor's share, never of collections", () => {
  assert.equal(assistantPay(1_000_000, { payMode: "salary", salary: 300_000, pct: 0 }), 300_000);
  assert.equal(assistantPay(1_000_000, { payMode: "percent", salary: 0, pct: 10 }), 100_000);
  assert.equal(assistantPay(0, { payMode: "percent", salary: 0, pct: 10 }), 0);
  assert.deepEqual(splitDoctorShare(1_000_000, [300_000, 100_000]), {
    net: 600_000,
    assistantsTotal: 400_000,
    shortfall: 0,
  });
  assert.deepEqual(splitDoctorShare(200_000, [300_000]), {
    net: 0,
    assistantsTotal: 300_000,
    shortfall: 100_000,
  });
  assert.equal(assistantWorksIn("2026-07", "2026-07-20", null), true);
  assert.equal(assistantWorksIn("2026-06", "2026-07-20", null), false);
  assert.equal(assistantWorksIn("2026-08", "2026-07-01", "2026-07-31"), false);
  assert.equal(assistantWorksIn("2026-07", "2026-07-01", "2026-07-02"), true);
});

test("a doctor with no assistant keeps exactly the share he always had", () => {
  const r = row(hired);
  assert.equal(r.grossPayout, 1_000_000);
  assert.equal(r.payout, 1_000_000);
  assert.equal(r.assistantsTotal, 0);
});

test("salary + percent assistants are taken from the doctor's share", () => {
  const salary = mutations.createAssistant({
    name: "مساعدة براتب",
    doctorId: hired,
    payMode: "salary",
    salary: 300_000,
    pct: 99, // ignored in salary mode
    startDate: "2026-07-01",
  });
  const percent = mutations.createAssistant({
    name: "مساعد بنسبة",
    doctorId: hired,
    payMode: "percent",
    salary: 0,
    pct: 10,
    startDate: "2026-07-15",
  });
  assert.equal(salary.ok && percent.ok, true);

  const result = settlement.computeSettlement(PERIOD);
  const r = result.doctors.find((d) => d.doctorId === hired)!;
  assert.equal(r.grossPayout, 1_000_000);
  assert.equal(r.assistantsTotal, 400_000); // 300,000 + 10% of 1,000,000
  assert.equal(r.payout, 600_000);
  assert.equal(result.totalAssistants, 400_000);
  // Shares leave the drawer as doctor + assistants = the original share.
  assert.equal(
    result.clinicNet,
    result.totalCollected + result.xrayIncome - 1_000_000 - result.monthExpenses,
  );

  // Not working in June: June charges nobody.
  assert.equal(row(hired, "2026-06").assistantsTotal, 0);
});

test("an owner at 0% with a salaried assistant: doctor gets 0, the clinic pays it", () => {
  const created = mutations.createAssistant({
    name: "مساعد المالك",
    doctorId: owner,
    payMode: "salary",
    salary: 250_000,
    pct: 0,
    startDate: "2026-07-01",
  });
  assert.equal(created.ok, true);
  const result = settlement.computeSettlement(PERIOD);
  const r = result.doctors.find((d) => d.doctorId === owner)!;
  assert.equal(r.grossPayout, 0);
  assert.equal(r.payout, 0);
  assert.equal(r.assistantsShortfall, 250_000);
  assert.equal(result.totalAssistants, 650_000);
  assert.equal(
    result.clinicNet,
    result.totalCollected - result.totalPayout - 650_000 - result.monthExpenses,
  );
});

test("closing freezes assistant pay; later edits do not move a closed month", () => {
  settlement.closeSettlement(PERIOD);
  const pct = dbClient.db
    .select()
    .from(schema.assistants)
    .all()
    .find((a) => a.payMode === "percent")!;
  const edited = mutations.updateAssistant(pct.id, {
    name: pct.name,
    doctorId: pct.doctorId,
    payMode: "percent",
    salary: 0,
    pct: 50,
    startDate: pct.startDate,
  });
  assert.equal(edited.ok, true);

  const r = row(hired);
  assert.equal(r.status, "closed");
  assert.equal(r.assistantsTotal, 400_000);
  assert.equal(r.payout, 600_000);
  const frozen = settlement
    .computeSettlement(PERIOD)
    .assistants.find((a) => a.assistantId === pct.id)!;
  assert.equal(frozen.pct, 10);
  assert.equal(frozen.amount, 100_000);
});

test("an assistant's pay is paid once, as a cash outflow, and locks the month", () => {
  const salaried = dbClient.db
    .select()
    .from(schema.assistants)
    .all()
    .find((a) => a.name === "مساعدة براتب")!;
  const paid = settlement.finalizeAssistantPayout({
    period: PERIOD,
    assistantId: salaried.id,
    paidDate: "2026-08-01",
  });
  assert.equal(paid.ok, true);
  if (!paid.ok) return;
  const movement = dbClient.db
    .select()
    .from(schema.cashMovements)
    .where(eq(schema.cashMovements.id, paid.cashMovementId))
    .get()!;
  assert.equal(movement.amount, -300_000);
  assert.equal(movement.refTable, "assistant_settlements");

  const again = settlement.finalizeAssistantPayout({
    period: PERIOD,
    assistantId: salaried.id,
    paidDate: "2026-08-01",
  });
  assert.deepEqual(again, { ok: false, reason: "already_paid" });
  assert.equal(settlement.reopenSettlement(PERIOD), false);
  assert.equal(settlement.computeSettlement(PERIOD).anyPaid, true);
});

test("an assistant with a closed month cannot be deleted, only stopped", () => {
  const salaried = dbClient.db
    .select()
    .from(schema.assistants)
    .all()
    .find((a) => a.name === "مساعدة براتب")!;
  assert.deepEqual(mutations.deleteAssistant(salaried.id), { ok: false, reason: "has_history" });
  assert.deepEqual(mutations.setAssistantEnd(salaried.id, "2026-07-31"), { ok: true });
  // August: the salaried one has stopped; the 50% one still works, but the
  // doctor collected nothing in August, so 50% of a zero share is zero.
  assert.equal(row(hired, "2026-08").assistantsTotal, 0);
});

test("assistant validation refuses a blank name, a zero salary, a 0% or 101% share", () => {
  const base = {
    name: "س",
    doctorId: hired,
    payMode: "salary" as const,
    salary: 1,
    pct: 0,
    startDate: "2026-07-01",
  };
  assert.deepEqual(mutations.createAssistant({ ...base, name: " " }), {
    ok: false,
    reason: "empty_name",
  });
  assert.deepEqual(mutations.createAssistant({ ...base, salary: 0 }), {
    ok: false,
    reason: "invalid_amount",
  });
  assert.deepEqual(mutations.createAssistant({ ...base, payMode: "percent", pct: 0 }), {
    ok: false,
    reason: "invalid_pct",
  });
  assert.deepEqual(mutations.createAssistant({ ...base, payMode: "percent", pct: 101 }), {
    ok: false,
    reason: "invalid_pct",
  });
  assert.deepEqual(mutations.createAssistant({ ...base, doctorId: 9999 }), {
    ok: false,
    reason: "doctor_not_found",
  });
});
