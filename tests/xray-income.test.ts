import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/**
 * The one rule that makes الأشعة different from every other treatment: the
 * money is the clinic's. A doctor's collected total, work-done total and payout
 * must not move when an X-ray is billed and paid on their name — while the
 * cash, and the clinic's net, must.
 *
 * This is worth a test rather than a comment because nothing in the code says
 * "exclude X-rays" at the point where a payout is calculated: the exclusion is
 * structural (per-doctor sums ask for the three doctor buckets by name), so a
 * later change that starts summing buckets generically would silently begin
 * paying commission on X-ray income.
 */

const testDir = mkdtempSync(path.join(tmpdir(), "zuha-xray-"));
process.env.ZUHA_DB = path.join(testDir, "xray.db");

const PERIOD = "2026-08";
const DATE = "2026-08-12";

let dbClient: typeof import("@/lib/db/client");
let schema: typeof import("@/lib/db/schema");
let computeSettlement: typeof import("@/lib/settlement")["computeSettlement"];
let recordXray: typeof import("@/lib/mutations")["recordXray"];
let createCaseWithPayment: typeof import("@/lib/mutations")["createCaseWithPayment"];
let cashOnHand: typeof import("@/lib/server-utils")["cashOnHand"];

let doctorId: number;
let patientId: number;
let normalTypeId: number;
let xrayTypeId: number;

before(async () => {
  dbClient = await import("@/lib/db/client");
  schema = await import("@/lib/db/schema");
  const mutations = await import("@/lib/mutations");
  const settlement = await import("@/lib/settlement");
  const serverUtils = await import("@/lib/server-utils");
  recordXray = mutations.recordXray;
  createCaseWithPayment = mutations.createCaseWithPayment;
  computeSettlement = settlement.computeSettlement;
  cashOnHand = serverUtils.cashOnHand;

  migrate(dbClient.db, { migrationsFolder: path.resolve("drizzle") });
  dbClient.db.insert(schema.settings).values({ id: 1, defaultCommissionPct: 50 }).run();

  doctorId = Number(
    dbClient.db
      .insert(schema.doctors)
      .values({ name: "د. الأشعة", commissionPct: 50, sortOrder: 1 })
      .run().lastInsertRowid,
  );
  patientId = Number(
    dbClient.db.insert(schema.patients).values({ fullName: "مريض أشعة" }).run()
      .lastInsertRowid,
  );
  normalTypeId = Number(
    dbClient.db
      .insert(schema.treatmentTypes)
      .values({ key: "xt_filling", nameAr: "حشوة", nameEn: "Filling", settlementBucket: "normal" })
      .run().lastInsertRowid,
  );
  xrayTypeId = Number(
    dbClient.db
      .insert(schema.treatmentTypes)
      .values({
        key: "xt_panoramic",
        nameAr: "أشعة بانوراما",
        nameEn: "Panoramic",
        settlementBucket: "xray",
      })
      .run().lastInsertRowid,
  );
});

after(() => {
  dbClient.sqlite.close();
  rmSync(testDir, { recursive: true, force: true });
});

test("X-ray income stays out of every doctor figure and inside the clinic's", () => {
  // Ordinary work first, so the doctor has a real share to compare against.
  createCaseWithPayment({
    patientId,
    doctorId,
    treatmentTypeId: normalTypeId,
    openedDate: DATE,
    listPrice: 100_000,
    discount: 0,
    totalPrice: 100_000,
    firstPayment: { amount: 100_000, kind: "down_payment" },
  });

  const before = computeSettlement(PERIOD);
  const beforeDoctor = before.doctors.find((d) => d.doctorId === doctorId)!;
  assert.equal(beforeDoctor.collectedTotal, 100_000);
  assert.equal(beforeDoctor.accruedTotal, 100_000);
  assert.equal(beforeDoctor.payout, 50_000);
  assert.equal(before.xrayIncome, 0);
  const cashBefore = cashOnHand();

  // Same doctor, same month, paid in full: 15,000 of clinic money.
  const result = recordXray({
    patientId,
    doctorId,
    treatmentTypeId: xrayTypeId,
    date: DATE,
    listPrice: 15_000,
    discount: 0,
    paidNow: 15_000,
  });
  assert.equal(result.ok, true);

  const afterXray = computeSettlement(PERIOD);
  const afterDoctor = afterXray.doctors.find((d) => d.doctorId === doctorId)!;

  // Nothing the doctor is paid on may have moved.
  assert.equal(afterDoctor.collectedImplant, beforeDoctor.collectedImplant);
  assert.equal(afterDoctor.collectedOrtho, beforeDoctor.collectedOrtho);
  assert.equal(afterDoctor.collectedNormal, beforeDoctor.collectedNormal);
  assert.equal(afterDoctor.collectedTotal, 100_000);
  assert.equal(afterDoctor.accruedTotal, 100_000);
  assert.equal(afterDoctor.payout, 50_000);
  assert.equal(afterXray.totalCollected, before.totalCollected);
  assert.equal(afterXray.totalPayout, before.totalPayout);

  // The money is not lost: it is cash in the drawer and clinic net.
  assert.equal(afterXray.xrayIncome, 15_000);
  assert.equal(cashOnHand(), cashBefore + 15_000);
  assert.equal(
    afterXray.clinicNet,
    afterXray.totalCollected + 15_000 - afterXray.totalPayout - afterXray.monthExpenses,
  );
  assert.equal(afterXray.clinicNet, before.clinicNet + 15_000);
});

test("an unpaid X-ray bills the patient without paying anyone a share", () => {
  const before = computeSettlement(PERIOD);

  const result = recordXray({
    patientId,
    doctorId,
    treatmentTypeId: xrayTypeId,
    date: DATE,
    listPrice: 50_000,
    discount: 10_000,
    paidNow: 0,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  // Total is derived server-side from price − discount, never taken as given.
  assert.equal(result.total, 40_000);
  assert.equal(result.paymentId, null);

  const after = computeSettlement(PERIOD);
  assert.equal(after.xrayIncome, before.xrayIncome); // nothing collected yet
  assert.equal(
    after.doctors.find((d) => d.doctorId === doctorId)!.payout,
    before.doctors.find((d) => d.doctorId === doctorId)!.payout,
  );
});

test("the X-ray register refuses to bill dental work", () => {
  const result = recordXray({
    patientId,
    doctorId,
    treatmentTypeId: normalTypeId, // a filling, not an X-ray
    date: DATE,
    listPrice: 100_000,
    discount: 0,
    paidNow: 100_000,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "not_xray");
});

test("a paid X-ray refuses deletion; an unpaid one is removed cleanly", async () => {
  const mutations = await import("@/lib/mutations");

  // Paid film: deleting it here would erase cash that was actually received.
  const paidFilm = mutations.recordXray({
    patientId,
    doctorId,
    treatmentTypeId: xrayTypeId,
    date: DATE,
    listPrice: 15_000,
    discount: 0,
    paidNow: 15_000,
  });
  assert.equal(paidFilm.ok, true);
  if (!paidFilm.ok) return;
  const refused = mutations.removeXray(paidFilm.caseId);
  assert.equal(refused.ok, false);
  if (refused.ok) return;
  assert.equal(refused.reason, "has_payments");

  // Unpaid film: a plain typo, removed with the row kept in the audit log.
  const typo = mutations.recordXray({
    patientId,
    doctorId,
    treatmentTypeId: xrayTypeId,
    date: DATE,
    listPrice: 15_000,
    discount: 0,
    paidNow: 0,
  });
  assert.equal(typo.ok, true);
  if (!typo.ok) return;
  const before = computeSettlement(PERIOD);
  assert.equal(mutations.removeXray(typo.caseId).ok, true);
  assert.equal(mutations.removeXray(typo.caseId).ok, false); // already gone

  // Removing a film changes no doctor's money.
  const after = computeSettlement(PERIOD);
  assert.equal(after.totalPayout, before.totalPayout);
  assert.equal(after.xrayIncome, before.xrayIncome);

  // Dental work can never be deleted through the X-ray door.
  const notXray = mutations.removeXray(
    mutations.createCaseWithPayment({
      patientId,
      doctorId,
      treatmentTypeId: normalTypeId,
      openedDate: DATE,
      listPrice: 10_000,
      discount: 0,
      totalPrice: 10_000,
    }).caseId,
  );
  assert.equal(notXray.ok, false);
  if (notXray.ok) return;
  assert.equal(notXray.reason, "not_xray");
});

test("an X-ray cannot be saved as paid for more than it costs", () => {
  const result = recordXray({
    patientId,
    doctorId,
    treatmentTypeId: xrayTypeId,
    date: DATE,
    listPrice: 15_000,
    discount: 0,
    paidNow: 20_000,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "paid_exceeds_total");
});
