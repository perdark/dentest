import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/**
 * مستحقات المختبر — تتبّع لا صرف. [قرار العيادة 2026-08-19]
 *
 * الاتفاق بين الطبيب ومختبره، والعيادة تمسك الدفتر فقط. يترتب على ذلك شرطان
 * يجب أن يبقيا صحيحين معاً، وكلاهما غير مرئي في الشاشة:
 *   1. لا يدخل أي قيد مختبر في حصة طبيب ولا في صافي العيادة.
 *   2. قيد يُكتب على شهر مُقفل لا يجعل الحصيلة «قديمة» — الحصص لم تتغيّر.
 *
 * The second one is why `recordEdit` gained `markStale`. It is a one-word
 * difference at the call site and nothing on screen would look wrong if it
 * regressed: the clinic would simply be told, every time a late lab bill is
 * entered, that a month it already settled and paid out needs re-opening.
 * The audit row must still be written and still flagged, so the log stays
 * honest — only the false alarm is suppressed.
 */

const testDir = mkdtempSync(path.join(tmpdir(), "zuha-lab-"));
process.env.ZUHA_DB = path.join(testDir, "lab.db");

const PERIOD = "2026-08";
const DATE = "2026-08-14";

let dbClient: typeof import("@/lib/db/client");
let schema: typeof import("@/lib/db/schema");
let addLabEntry: typeof import("@/lib/mutations")["addLabEntry"];
let deleteLabEntry: typeof import("@/lib/mutations")["deleteLabEntry"];
let labDuesForPeriod: typeof import("@/lib/queries")["labDuesForPeriod"];
let labDuesTotal: typeof import("@/lib/queries")["labDuesTotal"];
let computeSettlement: typeof import("@/lib/settlement")["computeSettlement"];

let doctorId: number;

before(async () => {
  dbClient = await import("@/lib/db/client");
  schema = await import("@/lib/db/schema");
  const mutations = await import("@/lib/mutations");
  const queries = await import("@/lib/queries");
  const settlement = await import("@/lib/settlement");
  addLabEntry = mutations.addLabEntry;
  deleteLabEntry = mutations.deleteLabEntry;
  labDuesForPeriod = queries.labDuesForPeriod;
  labDuesTotal = queries.labDuesTotal;
  computeSettlement = settlement.computeSettlement;

  migrate(dbClient.db, { migrationsFolder: path.resolve("drizzle") });
  dbClient.db.insert(schema.settings).values({ id: 1, defaultCommissionPct: 50 }).run();

  doctorId = Number(
    dbClient.db
      .insert(schema.doctors)
      .values({ name: "د. علي", commissionPct: 50, sortOrder: 1, labName: "دوبرا" })
      .run().lastInsertRowid,
  );
});

after(() => {
  dbClient.sqlite.close();
  rmSync(testDir, { recursive: true, force: true });
});

test("both lab branches total separately and together", () => {
  addLabEntry({ doctorId, branch: "fixed", entryDate: DATE, amount: 300_000 });
  addLabEntry({ doctorId, branch: "fixed", entryDate: DATE, amount: 200_000 });
  addLabEntry({ doctorId, branch: "mobile", entryDate: DATE, amount: 150_000 });

  const dues = labDuesForPeriod(PERIOD).get(doctorId);
  assert.equal(dues?.fixed, 500_000, "الفرع الثابت يجمع قيديه");
  assert.equal(dues?.mobile, 150_000, "الفرع المتحرك منفصل عن الثابت");
  assert.equal(dues?.total, 650_000);
  assert.equal(labDuesTotal(PERIOD), 650_000);
});

test("a payment to the lab is entered negative and reduces what is outstanding", () => {
  addLabEntry({ doctorId, branch: "fixed", entryDate: DATE, amount: -100_000 });

  assert.equal(labDuesForPeriod(PERIOD).get(doctorId)?.fixed, 400_000);
  assert.equal(labDuesTotal(PERIOD), 550_000);
});

test("lab money never reaches a doctor's share or the clinic's net", () => {
  const result = computeSettlement(PERIOD);
  const mine = result.doctors.find((d) => d.doctorId === doctorId);

  // لا مبالغ محصّلة في هذا الشهر — فالحصة صفر رغم وجود مستحقات مختبر كبيرة.
  assert.equal(mine?.payout, 0, "قيود المختبر لا تُنشئ حصة");
  assert.equal(mine?.labCost, 0, "labCost حقل الحالات، لا علاقة له بقيود المختبر");
  assert.equal(result.totalPayout, 0);
  assert.equal(
    result.clinicNet,
    0,
    "صافي العيادة لا يتأثر بمال لا يمرّ بصندوقها",
  );
});

test("a lab entry on a CLOSED month is audit-flagged but does NOT mark it stale", () => {
  dbClient.db
    .insert(schema.monthlySettlements)
    .values({
      period: PERIOD,
      doctorId,
      status: "closed",
      collectedTotal: 0,
      labCost: 0,
      commissionPct: 50,
      payout: 0,
    })
    .run();

  const before = dbClient.db.select().from(schema.monthlySettlements).all();
  assert.equal(before[0].status, "closed", "تهيئة الاختبار: الشهر مُقفل");

  const id = addLabEntry({
    doctorId,
    branch: "mobile",
    entryDate: DATE,
    amount: 90_000,
    note: "فاتورة متأخرة",
  });

  const afterInsert = dbClient.db.select().from(schema.monthlySettlements).all();
  assert.equal(
    afterInsert[0].status,
    "closed",
    "الشهر المُقفل يبقى مُقفلاً — مال المختبر خارج الحصص أصلاً",
  );

  // السجل يبقى صادقاً: القيد مكتوب وموسوم بأنه أصاب شهراً مُقفلاً.
  const audit = dbClient.db.select().from(schema.auditLog).all();
  const row = audit.find((a) => a.entity === "lab_entries" && a.entityId === id);
  assert.ok(row, "قيد المختبر يُسجَّل في سجل التعديلات");
  assert.equal(row!.hitClosedPeriod, true, "ويُوسم بأنه أصاب شهراً مُقفلاً");

  // والحذف يتصرّف بنفس المنطق.
  deleteLabEntry(id);
  const afterDelete = dbClient.db.select().from(schema.monthlySettlements).all();
  assert.equal(afterDelete[0].status, "closed", "الحذف كذلك لا يفتح شهراً مُقفلاً");
});
