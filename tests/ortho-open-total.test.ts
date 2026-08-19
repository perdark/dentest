import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/**
 * التقويم بلا إجمالي متفق عليه — قرار العيادة 2026-08-19.
 *
 * حالة التقويم تُفتح بإجمالي صفر: مقدمة في البداية، ثم مبلغ يُكتب عند كل جلسة.
 * ينتج عن ذلك أمران يجب أن يبقيا صحيحين معاً:
 *   1. لا سقف على الدفعات — حارس «المبلغ أكبر من المتبقي» لا ينطبق عليها.
 *   2. لا دَين على المريض — الفرق (0 − المدفوع) سالب، ويجب ألّا يظهر في أي شاشة
 *      أرصدة، لا للحالات الجديدة ولا للقديمة التي ما زالت تحمل إجمالياً محفوظاً.
 *
 * This is worth a test rather than a comment because the bypass is a condition
 * inside a guard: removing it looks harmless (the guard is still there) yet it
 * would refuse a routine session payment at the desk. The debts exclusion is
 * the mirror image — written per query, so a new balance screen must remember
 * it, and this test is what catches the one that forgets.
 */

const testDir = mkdtempSync(path.join(tmpdir(), "zuha-ortho-"));
process.env.ZUHA_DB = path.join(testDir, "ortho.db");

const DATE = "2026-08-12";

let dbClient: typeof import("@/lib/db/client");
let schema: typeof import("@/lib/db/schema");
let createCaseWithPayment: typeof import("@/lib/mutations")["createCaseWithPayment"];
let recordCasePayment: typeof import("@/lib/mutations")["recordCasePayment"];
let caseWithDetails: typeof import("@/lib/queries")["caseWithDetails"];
let debtsList: typeof import("@/lib/queries")["debtsList"];
let openCasesBrief: typeof import("@/lib/queries")["openCasesBrief"];
let dashboardStats: typeof import("@/lib/queries")["dashboardStats"];

let doctorId: number;
let patientId: number;
let orthoTypeId: number;
let normalTypeId: number;

let openEndedCaseId: number;
let legacyOrthoCaseId: number;
let normalCaseId: number;

before(async () => {
  dbClient = await import("@/lib/db/client");
  schema = await import("@/lib/db/schema");
  const mutations = await import("@/lib/mutations");
  const queries = await import("@/lib/queries");
  createCaseWithPayment = mutations.createCaseWithPayment;
  recordCasePayment = mutations.recordCasePayment;
  caseWithDetails = queries.caseWithDetails;
  debtsList = queries.debtsList;
  openCasesBrief = queries.openCasesBrief;
  dashboardStats = queries.dashboardStats;

  migrate(dbClient.db, { migrationsFolder: path.resolve("drizzle") });
  dbClient.db.insert(schema.settings).values({ id: 1, defaultCommissionPct: 50 }).run();

  doctorId = Number(
    dbClient.db
      .insert(schema.doctors)
      .values({ name: "د. التقويم", commissionPct: 50, sortOrder: 1, doesOrtho: true })
      .run().lastInsertRowid,
  );
  patientId = Number(
    dbClient.db.insert(schema.patients).values({ fullName: "مريض التقويم" }).run()
      .lastInsertRowid,
  );
  orthoTypeId = Number(
    dbClient.db
      .insert(schema.treatmentTypes)
      .values({
        key: "ot_ortho",
        nameAr: "تقويم",
        nameEn: "Orthodontics",
        settlementBucket: "ortho",
        isOrtho: true,
      })
      .run().lastInsertRowid,
  );
  normalTypeId = Number(
    dbClient.db
      .insert(schema.treatmentTypes)
      .values({
        key: "ot_filling",
        nameAr: "حشوة",
        nameEn: "Filling",
        settlementBucket: "normal",
      })
      .run().lastInsertRowid,
  );
});

after(() => {
  dbClient.sqlite.close();
  rmSync(testDir, { recursive: true, force: true });
});

test("an open-ended ortho case takes a down payment and any number of session amounts", () => {
  const created = createCaseWithPayment({
    patientId,
    doctorId,
    treatmentTypeId: orthoTypeId,
    openedDate: DATE,
    listPrice: 0,
    discount: 0,
    totalPrice: 0,
    firstPayment: { amount: 250_000, kind: "down_payment" },
  });
  openEndedCaseId = created.caseId;
  assert.ok(created.paymentId, "المقدمة على حالة بإجمالي صفر يجب أن تُقبل");

  // كل جلسة بمبلغها — لا سقف يوقف الثالثة لأن ما قبلها «استهلك» الإجمالي.
  for (const amount of [100_000, 75_000, 130_000]) {
    const result = recordCasePayment({
      caseId: openEndedCaseId,
      amount,
      kind: "session",
      paidDate: DATE,
      expectedCourse: "ortho",
    });
    assert.equal(result.ok, true, `دفعة الجلسة ${amount} رُفضت`);
  }

  const detail = caseWithDetails(openEndedCaseId)!;
  assert.equal(detail.paid, 555_000);
  assert.equal(detail.totalPrice, 0);
});

test("an open-ended ortho case is never a patient debt", () => {
  const debtIds = debtsList().map((r) => r.id);
  assert.ok(
    !debtIds.includes(openEndedCaseId),
    "حالة التقويم المفتوحة يجب ألّا تظهر في الديون",
  );

  // المدفوع أكبر من الإجمالي (صفر)، فالرصيد سالب ولا يُجمع في «المتبقي على المرضى».
  const stats = dashboardStats();
  assert.equal(stats.outstanding, 0);

  const pickerIds = openCasesBrief().map((c) => c.id);
  assert.ok(
    !pickerIds.includes(openEndedCaseId),
    "جلسات التقويم تُضاف من شاشة التقويم وحدها",
  );
});

test("a legacy ortho case that still carries a stored total is excluded too", () => {
  legacyOrthoCaseId = createCaseWithPayment({
    patientId,
    doctorId,
    treatmentTypeId: orthoTypeId,
    openedDate: DATE,
    listPrice: 1_000_000,
    discount: 0,
    totalPrice: 1_000_000,
    firstPayment: { amount: 200_000, kind: "down_payment" },
  }).caseId;

  // 800,000 من فرق الأرقام محفوظة في قاعدة البيانات، ولا شيء منها يُطالَب به.
  assert.equal(caseWithDetails(legacyOrthoCaseId)!.remaining, 800_000);
  assert.ok(!debtsList().map((r) => r.id).includes(legacyOrthoCaseId));
  assert.ok(!openCasesBrief().map((c) => c.id).includes(legacyOrthoCaseId));
  assert.equal(dashboardStats().outstanding, 0);
});

test("a refund on an open-ended ortho case is still capped by what was paid", () => {
  const tooMuch = recordCasePayment({
    caseId: openEndedCaseId,
    amount: 555_001,
    kind: "refund",
    paidDate: DATE,
    expectedCourse: "ortho",
  });
  assert.equal(tooMuch.ok, false);
  assert.equal(tooMuch.ok === false && tooMuch.reason, "refund_exceeds_paid");

  const allowed = recordCasePayment({
    caseId: openEndedCaseId,
    amount: 55_000,
    kind: "refund",
    paidDate: DATE,
    expectedCourse: "ortho",
  });
  assert.equal(allowed.ok, true);
  assert.equal(caseWithDetails(openEndedCaseId)!.paid, 500_000);
});

test("ordinary treatment still refuses a payment above its remaining balance", () => {
  normalCaseId = createCaseWithPayment({
    patientId,
    doctorId,
    treatmentTypeId: normalTypeId,
    openedDate: DATE,
    listPrice: 100_000,
    discount: 0,
    totalPrice: 100_000,
    firstPayment: { amount: 60_000, kind: "down_payment" },
  }).caseId;

  const over = recordCasePayment({
    caseId: normalCaseId,
    amount: 40_001,
    kind: "session",
    paidDate: DATE,
  });
  assert.equal(over.ok, false);
  assert.equal(over.ok === false && over.reason, "exceeds_remaining");

  // ...وحالة عادية بإجمالي صفر لا تفلت من الحارس: الاستثناء للتقويم وحده.
  const zeroNormalCaseId = createCaseWithPayment({
    patientId,
    doctorId,
    treatmentTypeId: normalTypeId,
    openedDate: DATE,
    listPrice: 0,
    discount: 0,
    totalPrice: 0,
  }).caseId;
  const onZero = recordCasePayment({
    caseId: zeroNormalCaseId,
    amount: 1_000,
    kind: "session",
    paidDate: DATE,
  });
  assert.equal(onZero.ok, false);
  assert.equal(onZero.ok === false && onZero.reason, "exceeds_remaining");

  // العلاج العادي غير المكتمل يبقى ديناً على المريض كما كان.
  assert.ok(debtsList().map((r) => r.id).includes(normalCaseId));
  assert.equal(dashboardStats().outstanding, 40_000);
});
