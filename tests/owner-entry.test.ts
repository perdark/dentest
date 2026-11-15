import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";

// «د. عدي» — the owner's four notebook entries. [قرار العيادة 2026-11-15]
const testDir = mkdtempSync(path.join(tmpdir(), "zuha-owner-entry-"));
process.env.ZUHA_DB = path.join(testDir, "owner-entry.db");

let dbClient: typeof import("@/lib/db/client");
let schema: typeof import("@/lib/db/schema");
let mutations: typeof import("@/lib/mutations");
let settlement: typeof import("@/lib/settlement");
let queries: typeof import("@/lib/queries");
let owner: number;
let hired: number;
let orthoDoctor: number;

const D = "2026-10-10";
const period = "2026-10";

before(async () => {
  dbClient = await import("@/lib/db/client");
  schema = await import("@/lib/db/schema");
  mutations = await import("@/lib/mutations");
  settlement = await import("@/lib/settlement");
  queries = await import("@/lib/queries");
  migrate(dbClient.db, { migrationsFolder: path.resolve("drizzle") });

  const doctor = (v: Partial<typeof schema.doctors.$inferInsert> & { name: string }) =>
    Number(dbClient.db.insert(schema.doctors).values(v).run().lastInsertRowid);
  owner = doctor({ name: "د. المالك", sortOrder: 1, commissionPct: 0, isOwner: true, doesOrtho: true, doesImplants: true });
  hired = doctor({ name: "د. موظف", sortOrder: 2, commissionPct: 50 });
  orthoDoctor = doctor({ name: "د. التقويم", sortOrder: 5, commissionPct: 30, doesOrtho: true, doesNormal: false });

  const type = (key: string, nameAr: string, bucket: "normal" | "implant" | "ortho", flags = {}) =>
    dbClient.db
      .insert(schema.treatmentTypes)
      .values({ key, nameAr, nameEn: key, settlementBucket: bucket, ...flags })
      .run();
  type("implant", "زراعة", "implant", { isImplant: true });
  type("ortho", "تقويم", "ortho", { isOrtho: true });
  type("filling", "حشوة", "normal");
});

after(() => {
  dbClient.sqlite.close();
  rmSync(testDir, { recursive: true, force: true });
});

const caseOf = (id: number) =>
  dbClient.db.select().from(schema.cases).where(eq(schema.cases.id, id)).get()!;
const paymentsOf = (caseId: number) =>
  dbClient.db.select().from(schema.payments).where(eq(schema.payments.caseId, caseId)).all();
const ownerRow = () => settlement.computeSettlement(period).doctors.find((d) => d.doctorId === owner)!;

test("عمل عادي: a new case on the owner, paid in full by default", () => {
  const r = mutations.recordOwnerEntry({
    kind: "work",
    patient: { fullName: "مريض العمل" },
    amount: 75_000,
    date: D,
    treatmentName: "حشوة",
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const c = caseOf(r.caseId);
  assert.equal(c.doctorId, owner);
  assert.equal(c.totalPrice, 75_000);
  assert.deepEqual(paymentsOf(r.caseId).map((p) => [p.amount, p.doctorId]), [[75_000, owner]]);

  // With a price above what is paid, the rest stays owing.
  const owing = mutations.recordOwnerEntry({
    kind: "work",
    patient: { id: r.patientId },
    amount: 50_000,
    price: 200_000,
    date: D,
    treatmentName: "حشوة",
  });
  assert.equal(owing.ok, true);
  if (owing.ok) assert.equal(caseOf(owing.caseId).totalPrice, 200_000);
});

test("عمل عادي refuses «توصيل مبلغ», an implant name, and a price below what is paid", () => {
  const base = { kind: "work" as const, patient: { fullName: "لا يُحفظ" }, amount: 10_000, date: D };
  assert.deepEqual(mutations.recordOwnerEntry({ ...base, treatmentName: "توصيل مبلغ" }), {
    ok: false,
    reason: "payment_record",
  });
  assert.deepEqual(mutations.recordOwnerEntry({ ...base, treatmentName: "زراعه" }), {
    ok: false,
    reason: "implant_record",
  });
  assert.deepEqual(mutations.recordOwnerEntry({ ...base, treatmentName: "حشوة", price: 5_000 }), {
    ok: false,
    reason: "price_below_paid",
  });
  // A refused entry writes no patient.
  const found = dbClient.db
    .select()
    .from(schema.patients)
    .where(eq(schema.patients.fullName, "لا يُحفظ"))
    .all();
  assert.equal(found.length, 0);
});

test("توصيل مبلغ with no account: one line on the owner that never owes", () => {
  const before = ownerRow().collectedNormal;
  const r = mutations.recordOwnerEntry({
    kind: "delivery",
    patient: { fullName: "دين الدفتر القديم" },
    amount: 100_000,
    date: D,
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const c = caseOf(r.caseId);
  assert.equal(c.doctorId, owner);
  assert.equal(c.totalPrice, 100_000);
  const type = dbClient.db
    .select()
    .from(schema.treatmentTypes)
    .where(eq(schema.treatmentTypes.id, c.treatmentTypeId))
    .get()!;
  assert.equal(type.nameAr, "توصيل مبلغ");
  assert.equal(type.settlementBucket, "normal");
  // Counts in the month's collections, never in «الديون».
  assert.equal(ownerRow().collectedNormal - before, 100_000);
  assert.equal(queries.debtsList().some((d) => d.patientId === r.patientId), false);

  // A second one reuses the same type rather than adding a twin.
  const again = mutations.recordOwnerEntry({ kind: "delivery", patient: { id: r.patientId }, amount: 20_000, date: D });
  assert.equal(again.ok, true);
  if (again.ok) assert.equal(caseOf(again.caseId).treatmentTypeId, c.treatmentTypeId);
});

test("توصيل مبلغ on an open balance pays that case and credits its own doctor", () => {
  const patientId = mutations.findOrCreatePatient({ fullName: "عليه دين" });
  const filling = dbClient.db
    .select()
    .from(schema.treatmentTypes)
    .where(eq(schema.treatmentTypes.key, "filling"))
    .get()!;
  const { caseId } = mutations.createCaseWithPayment({
    patientId,
    doctorId: hired,
    treatmentTypeId: filling.id,
    openedDate: "2026-09-01",
    listPrice: 300_000,
    discount: 0,
    totalPrice: 300_000,
    firstPayment: { amount: 100_000 },
  });
  const targets = queries.ownerEntryTargets(patientId);
  assert.deepEqual(targets.delivery.map((c) => c.id), [caseId]);

  const r = mutations.recordOwnerEntry({ kind: "delivery", patient: { id: patientId }, amount: 50_000, date: D, caseId });
  assert.deepEqual(r, { ok: true, caseId, patientId });
  const pays = paymentsOf(caseId);
  assert.equal(pays.length, 2);
  assert.equal(pays[1].doctorId, hired);

  // More than the balance is refused, and nothing is written.
  const over = mutations.recordOwnerEntry({ kind: "delivery", patient: { id: patientId }, amount: 999_000, date: D, caseId });
  assert.deepEqual(over, { ok: false, reason: "exceeds_remaining" });
  assert.equal(paymentsOf(caseId).length, 2);

  // Another patient's case cannot be paid from here.
  const other = mutations.findOrCreatePatient({ fullName: "مريض آخر" });
  assert.deepEqual(
    mutations.recordOwnerEntry({ kind: "delivery", patient: { id: other }, amount: 10_000, date: D, caseId }),
    { ok: false, reason: "bad_target" },
  );
});

test("مقدمة تقويم: a new open-ended case on the ortho doctor, the down payment the owner's", () => {
  const before = ownerRow().collectedOrtho;
  const r = mutations.recordOwnerEntry({ kind: "ortho", patient: { fullName: "مريض تقويم" }, amount: 250_000, date: D });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const c = caseOf(r.caseId);
  assert.equal(c.doctorId, orthoDoctor);
  assert.equal(c.totalPrice, 0);
  assert.deepEqual(paymentsOf(r.caseId).map((p) => [p.kind, p.amount, p.doctorId]), [
    ["down_payment", 250_000, owner],
  ]);
  assert.equal(ownerRow().collectedOrtho - before, 250_000);
  const ortho = settlement.computeSettlement(period).doctors.find((d) => d.doctorId === orthoDoctor)!;
  assert.equal(ortho.payout, 0);

  // A second down payment goes on the same open case.
  assert.deepEqual(queries.ownerEntryTargets(r.patientId).ortho.map((x) => x.id), [r.caseId]);
  const more = mutations.recordOwnerEntry({
    kind: "ortho",
    patient: { id: r.patientId },
    amount: 50_000,
    date: D,
    caseId: r.caseId,
  });
  assert.deepEqual(more, { ok: true, caseId: r.caseId, patientId: r.patientId });
  assert.equal(paymentsOf(r.caseId).filter((p) => p.doctorId === owner).length, 2);
});

test("زراعة: a new card on the owner priced at what was paid, then a payment on it", () => {
  const r = mutations.recordOwnerEntry({ kind: "implant", patient: { fullName: "مريض زراعة" }, amount: 500_000, date: D });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const c = caseOf(r.caseId);
  assert.equal(c.doctorId, owner);
  assert.equal(c.totalPrice, 500_000);
  assert.notEqual(c.implantCardNo, null);

  // The card's remaining is 0 until its price is corrected — the message says so.
  const over = mutations.recordOwnerEntry({
    kind: "implant",
    patient: { id: r.patientId },
    amount: 100_000,
    date: D,
    caseId: r.caseId,
  });
  assert.deepEqual(over, { ok: false, reason: "exceeds_remaining" });
  assert.match(mutations.ownerEntryFailureMessage("exceeds_remaining"), /عدّل سعره/);

  // An ortho case is not a target for the implant button.
  const ortho = queries.ownerEntryTargets(r.patientId);
  assert.equal(ortho.implant.length, 1);
  assert.equal(ortho.ortho.length, 0);
});

test("amount and date are checked", () => {
  assert.deepEqual(
    mutations.recordOwnerEntry({ kind: "delivery", patient: { fullName: "س" }, amount: 0, date: D }),
    { ok: false, reason: "invalid_amount" },
  );
  assert.deepEqual(
    mutations.recordOwnerEntry({ kind: "ortho", patient: { fullName: "س" }, amount: 10_000, date: "2099-01-01" }),
    { ok: false, reason: "future_date" },
  );
});

test("the ortho option shows what is left of an agreed down payment", () => {
  const patientId = mutations.findOrCreatePatient({ fullName: "مقدمة متفق عليها" });
  const orthoType = dbClient.db
    .select()
    .from(schema.treatmentTypes)
    .where(eq(schema.treatmentTypes.key, "ortho"))
    .get()!;
  mutations.createCaseWithPayment({
    patientId,
    doctorId: orthoDoctor,
    treatmentTypeId: orthoType.id,
    openedDate: "2026-09-01",
    listPrice: 0,
    discount: 0,
    totalPrice: 0,
    downPaymentAgreed: 300_000,
    firstPayment: { amount: 300_000, kind: "down_payment" },
  });
  const [c] = queries.ownerEntryTargets(patientId).ortho;
  assert.equal(c.downPaymentLeft, 0);
  // …and a further down payment is refused with a message that says where to go.
  const r = mutations.recordOwnerEntry({ kind: "ortho", patient: { id: patientId }, amount: 50_000, date: D, caseId: c.id });
  assert.deepEqual(r, { ok: false, reason: "exceeds_down_payment" });
  assert.match(mutations.ownerEntryFailureMessage("exceeds_down_payment"), /شاشة التقويم/);
});

test("the owner's notebook totals add up to his settlement total, kind by kind", () => {
  const t = queries.ownerNotebookTotals(owner, period);
  const row = ownerRow();
  const sum = t.work + t.delivery + t.orthoDown + t.orthoSession + t.implant;
  assert.equal(sum, row.collectedTotal);
  assert.equal(t.implant, row.collectedImplant);
  assert.equal(t.orthoDown + t.orthoSession, row.collectedOrtho);
  assert.equal(t.work + t.delivery, row.collectedNormal);
  // What this file entered: 75k + 50k work, 100k + 20k paper deliveries,
  // 250k + 50k ortho down payments, 500k implant.
  assert.deepEqual(t, {
    work: 125_000,
    delivery: 120_000,
    orthoDown: 300_000,
    orthoSession: 0,
    implant: 500_000,
  });
});
