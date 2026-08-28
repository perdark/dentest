import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/**
 * «مسح كل السجلات» — أول خطوة في إجراء التسليم، وأخطرها.
 *
 * 🔴 كانت مكسورة بطريقتين، وكلتاهما غير مرئية من الشاشة:
 *
 *   1. `case_teeth` لم تكن في المسح، والمفاتيح الأجنبية مفعّلة — فمخطط أسنان
 *      واحد محفوظ كان يجعل حذف الحالات يرمي «FOREIGN KEY constraint failed»،
 *      فتُلغى المعاملة كلها ولا يُمسح شيء.
 *   2. `lab_entries` لم تكن فيه أيضاً، ولا شيء يشير إليها فلا ترمي خطأً —
 *      فتبقى مستحقات مختبر تجريبية في «الأطباء» ودفتر المختبرات كلها بينما
 *      يقول المسح إنه نجح.
 *
 * «no table in the schema is left unclassified» is the test that matters
 * long-term: it enumerates the live tables from `sqlite_master` and asserts
 * each one is either emptied or deliberately kept. Adding a table to the
 * schema without deciding which side it belongs on now fails here, instead of
 * surfacing as fictional money in a clinic's first real month. [2026-08-28]
 */

const testDir = mkdtempSync(path.join(tmpdir(), "zuha-wipe-"));
process.env.ZUHA_DB = path.join(testDir, "wipe.db");
process.env.ZUHA_QUIET = "1";

const DATE = "2026-08-14";
const PERIOD = "2026-08";

/** Records the wipe must delete. */
const MUST_EMPTY = [
  "patients",
  "cases",
  "payments",
  "appointments",
  "expenses",
  "cash_movements",
  "monthly_settlements",
  "xray_films",
  "case_teeth",
  "lab_entries",
] as const;

/** Clinic SETUP the wipe must keep — re-entering it would be a second job. */
const MUST_SURVIVE = ["doctors", "treatment_types", "settings", "counters", "price_list"] as const;

/** Neither: the audit log is emptied and then gets one row explaining the wipe. */
const SPECIAL = ["audit_log", "__drizzle_migrations"] as const;

let dbClient: typeof import("@/lib/db/client");
let schema: typeof import("@/lib/db/schema");
let wipeError: unknown = null;
let removed: import("@/lib/mutations").WipeCounts | null = null;
const countsBefore: Record<string, number> = {};

const rows = (table: string): number =>
  (dbClient.sqlite.prepare(`select count(*) as c from "${table}"`).get() as { c: number }).c;

before(async () => {
  dbClient = await import("@/lib/db/client");
  schema = await import("@/lib/db/schema");
  const { seed } = await import("@/lib/db/seed");
  const m = await import("@/lib/mutations");

  migrate(dbClient.db, { migrationsFolder: path.resolve("drizzle") });
  seed();

  const db = dbClient.db;
  const doctorId = db.select().from(schema.doctors).all()[0].id;
  const types = db.select().from(schema.treatmentTypes).all();
  const normalType = types.find((t) => t.settlementBucket === "normal")!;
  const xrayType = types.find((t) => t.settlementBucket === "xray")!;

  // One row in every table the wipe is supposed to clear.
  const patientId = m.createPatient({ fullName: "مريض الاختبار", phone: "07700000000" });
  const caseId = m.createCase({
    patientId,
    doctorId,
    treatmentTypeId: normalType.id,
    openedDate: DATE,
    listPrice: 100_000,
    discount: 0,
    totalPrice: 100_000,
  });
  const pay = m.recordCasePayment({
    caseId,
    paidDate: DATE,
    amount: 50_000,
    kind: "session",
  });
  assert.equal(pay.ok, true, "تهيئة الاختبار: الدفعة سُجّلت");

  // 🔴 السبب المباشر للعطل الأول — مخطط أسنان محفوظ على الحالة.
  const chart = m.setCaseTeeth(caseId, [{ scope: "tooth", toothCode: 11 }]);
  assert.equal(chart.ok, true, "تهيئة الاختبار: مخطط الأسنان حُفظ");

  m.createAppointment({ patientId, doctorId, apptDate: DATE });
  m.addExpense({ expenseDate: DATE, category: "food", amount: 20_000 });
  m.recordCashMovement({ moveDate: DATE, type: "reserve", amount: 300_000 });
  const film = m.recordXrayFilm({
    filmDate: DATE,
    treatmentTypeId: xrayType.id,
    placement: "internal",
    price: 15_000,
  });
  assert.equal(film.ok, true, "تهيئة الاختبار: الفيلم سُجّل");

  // 🔴 السبب المباشر للعطل الثاني — قيد مختبر لا يشير إليه شيء.
  m.addLabEntry({ doctorId, branch: "fixed", entryDate: DATE, amount: 400_000 });

  db.insert(schema.monthlySettlements)
    .values({
      period: PERIOD,
      doctorId,
      status: "closed",
      collectedTotal: 50_000,
      labCost: 0,
      commissionPct: 50,
      payout: 25_000,
    })
    .run();

  for (const t of [...MUST_EMPTY, ...MUST_SURVIVE]) countsBefore[t] = rows(t);
  for (const t of MUST_EMPTY) {
    assert.ok(countsBefore[t] > 0, `تهيئة الاختبار: الجدول ${t} ليس فارغاً قبل المسح`);
  }

  try {
    removed = m.wipeAllRecords("اختبار المسح");
  } catch (e) {
    wipeError = e;
  }
});

after(() => {
  dbClient.sqlite.close();
  rmSync(testDir, { recursive: true, force: true });
});

test("a saved tooth chart does not make the wipe throw", () => {
  assert.equal(
    wipeError,
    null,
    `المسح رمى خطأً بدل أن يكتمل: ${wipeError instanceof Error ? wipeError.message : String(wipeError)}`,
  );
  assert.ok(removed, "المسح أعاد حصيلة");
  assert.equal(rows("case_teeth"), 0, "علامات مخطط الأسنان حُذفت مع الحالات");
  assert.equal(removed!.caseTeeth, countsBefore["case_teeth"], "الحصيلة تعدّ ما حُذف منها");
});

test("lab entries do not survive the wipe", () => {
  assert.equal(rows("lab_entries"), 0, "قيود المختبر لا تبقى بعد المسح");
  assert.equal(removed!.labEntries, countsBefore["lab_entries"], "الحصيلة تعدّ قيود المختبر");
});

test("every record table is emptied and every setup table is kept", () => {
  for (const t of MUST_EMPTY) {
    assert.equal(rows(t), 0, `الجدول ${t} كان يجب أن يفرغ بالمسح`);
  }
  for (const t of MUST_SURVIVE) {
    assert.equal(
      rows(t),
      countsBefore[t],
      `الجدول ${t} إعدادُ عيادة ولا يجوز أن يمسّه المسح`,
    );
  }
});

test("no table in the schema is left unclassified", () => {
  const live = (
    dbClient.sqlite
      .prepare("select name from sqlite_master where type = 'table'")
      .all() as { name: string }[]
  )
    .map((r) => r.name)
    .filter((n) => !n.startsWith("sqlite_"));

  const classified = new Set<string>([...MUST_EMPTY, ...MUST_SURVIVE, ...SPECIAL]);
  const unclassified = live.filter((n) => !classified.has(n));

  assert.deepEqual(
    unclassified,
    [],
    `جدول جديد بلا قرار: أضِفه إلى MUST_EMPTY أو MUST_SURVIVE في هذا الاختبار، ` +
      `وإلى wipeAllRecords إن كان يحمل سجلات. [${unclassified.join(", ")}]`,
  );
});

test("the audit log is emptied but still explains itself", () => {
  const log = dbClient.db.select().from(schema.auditLog).all();
  assert.equal(log.length, 1, "لا يبقى إلا سطر واحد: المسح نفسه");
  assert.equal(log[0].entity, "settings");
  assert.equal(log[0].action, "delete");
});

test("the PIN and the implant counter come out of the wipe as the clinic needs them", () => {
  const s = dbClient.db.select().from(schema.settings).all()[0];
  assert.ok(s.pinHash, "رمز الدخول لا يُمسح — العيادة لا تُقفل خارج نظامها");
  assert.equal(s.demoDataAt, null, "علامة البيانات التجريبية رُفعت");

  const counters = dbClient.db.select().from(schema.counters).all();
  assert.ok(counters.length > 0, "العدّادات باقية");
  for (const c of counters) {
    assert.equal(c.value, 0, `العدّاد ${c.name} يعود إلى الصفر فيبدأ ترقيم العيادة من ١`);
  }
});
