import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/**
 * The one rule that makes الأشعة different from every other treatment: the
 * money is the clinic's. A doctor's collected total, work-done total and payout
 * must not move when an X-ray is taken and paid for — while the cash, and the
 * clinic's net, must.
 *
 * This is worth a test rather than a comment because nothing in the code says
 * "exclude X-rays" at the point where a payout is calculated: the exclusion is
 * structural (per-doctor sums ask for the three doctor buckets by name), so a
 * later change that starts summing buckets generically would silently begin
 * paying commission on X-ray income.
 *
 * Since 2026-08-25 a film is its own record (`xray_films`) with no patient and
 * no doctor: it is a cash sale, paid in full on its date. Two things must hold
 * together — the film's money reaches the clinic (income, cash on hand, net),
 * and any legacy X-ray *case* recorded before that decision still reports.
 */

const testDir = mkdtempSync(path.join(tmpdir(), "zuha-xray-"));
process.env.ZUHA_DB = path.join(testDir, "xray.db");

const PERIOD = "2026-08";
const DATE = "2026-08-12";

let dbClient: typeof import("@/lib/db/client");
let schema: typeof import("@/lib/db/schema");
let computeSettlement: typeof import("@/lib/settlement")["computeSettlement"];
let recordXrayFilm: typeof import("@/lib/mutations")["recordXrayFilm"];
let deleteXrayFilm: typeof import("@/lib/mutations")["deleteXrayFilm"];
let createCaseWithPayment: typeof import("@/lib/mutations")["createCaseWithPayment"];
let cashOnHand: typeof import("@/lib/server-utils")["cashOnHand"];
let xrayFilmsForMonth: typeof import("@/lib/queries")["xrayFilmsForMonth"];

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
  const queries = await import("@/lib/queries");
  recordXrayFilm = mutations.recordXrayFilm;
  deleteXrayFilm = mutations.deleteXrayFilm;
  createCaseWithPayment = mutations.createCaseWithPayment;
  computeSettlement = settlement.computeSettlement;
  cashOnHand = serverUtils.cashOnHand;
  xrayFilmsForMonth = queries.xrayFilmsForMonth;

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

  // Same month, paid in full: 15,000 of clinic money, belonging to nobody.
  const result = recordXrayFilm({
    filmDate: DATE,
    treatmentTypeId: xrayTypeId,
    placement: "internal",
    price: 15_000,
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

test("an outside film is income exactly like an inside one", () => {
  const before = computeSettlement(PERIOD);
  const cashBefore = cashOnHand();

  assert.equal(
    recordXrayFilm({
      filmDate: DATE,
      treatmentTypeId: xrayTypeId,
      placement: "external",
      price: 25_000,
    }).ok,
    true,
  );

  const after = computeSettlement(PERIOD);
  assert.equal(after.xrayIncome, before.xrayIncome + 25_000);
  assert.equal(cashOnHand(), cashBefore + 25_000);
  // داخل/خارج وصفٌ لا حساب: الرقمان منفصلان في العرض ومجموعهما هو الدخل.
  const month = xrayFilmsForMonth(PERIOD);
  assert.equal(month.internal, 15_000);
  assert.equal(month.external, 25_000);
  assert.equal(month.income, 40_000);
  assert.equal(month.count, 2);
  // ولا حصة لأحد منه.
  assert.equal(after.totalPayout, before.totalPayout);
});

test("the X-ray register refuses to bill dental work", () => {
  const result = recordXrayFilm({
    filmDate: DATE,
    treatmentTypeId: normalTypeId, // a filling, not an X-ray
    placement: "internal",
    price: 100_000,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "not_xray_type");

  // ولا تُقبل الأرقام المستحيلة: تاريخ غير صالح أو سعر سالب.
  assert.equal(
    recordXrayFilm({
      filmDate: "2026-13-40",
      treatmentTypeId: xrayTypeId,
      placement: "internal",
      price: 10_000,
    }).ok,
    false,
  );
  assert.equal(
    recordXrayFilm({
      filmDate: DATE,
      treatmentTypeId: xrayTypeId,
      placement: "internal",
      price: -1,
    }).ok,
    false,
  );
});

test("deleting a film takes its money back out of the clinic's books", () => {
  const typo = recordXrayFilm({
    filmDate: DATE,
    treatmentTypeId: xrayTypeId,
    placement: "internal",
    price: 30_000,
  });
  assert.equal(typo.ok, true);
  if (!typo.ok) return;

  const before = computeSettlement(PERIOD);
  const cashBefore = cashOnHand();
  assert.equal(deleteXrayFilm(typo.filmId), true);
  assert.equal(deleteXrayFilm(typo.filmId), false); // already gone

  const after = computeSettlement(PERIOD);
  assert.equal(after.xrayIncome, before.xrayIncome - 30_000);
  assert.equal(cashOnHand(), cashBefore - 30_000);
  // وحذف الفيلم لا يمسّ مال أي طبيب.
  assert.equal(after.totalPayout, before.totalPayout);
});

test("a legacy X-ray case recorded before 2026-08-25 still reports as clinic income", () => {
  const before = computeSettlement(PERIOD);

  // الصفوف القديمة كانت «حالة» على مريض بدفعة. لا شيء ينشئها بعد اليوم، لكن
  // قراءتها يجب أن تبقى صحيحة وإلا نقص دخل شهرٍ فيه الاثنان.
  createCaseWithPayment({
    patientId,
    doctorId,
    treatmentTypeId: xrayTypeId,
    openedDate: DATE,
    listPrice: 20_000,
    discount: 0,
    totalPrice: 20_000,
    firstPayment: { amount: 20_000, kind: "session" },
  });

  const after = computeSettlement(PERIOD);
  assert.equal(after.xrayIncome, before.xrayIncome + 20_000);
  // ولا تدخل حصة الطبيب الذي كانت مسجّلة باسمه.
  assert.equal(after.totalPayout, before.totalPayout);
  assert.equal(
    after.doctors.find((d) => d.doctorId === doctorId)!.collectedTotal,
    before.doctors.find((d) => d.doctorId === doctorId)!.collectedTotal,
  );
});
