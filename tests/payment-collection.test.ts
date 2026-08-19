import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq, sql } from "drizzle-orm";

const testDir = mkdtempSync(path.join(tmpdir(), "zuha-payments-"));
process.env.ZUHA_DB = path.join(testDir, "payments.db");

let dbClient: typeof import("@/lib/db/client");
let schema: typeof import("@/lib/db/schema");
let recordCasePayment: typeof import("@/lib/mutations")["recordCasePayment"];
let createCaseWithPayment: typeof import("@/lib/mutations")["createCaseWithPayment"];
let updateCaseMeta: typeof import("@/lib/mutations")["updateCaseMeta"];
let deletePayment: typeof import("@/lib/mutations")["deletePayment"];
let doctorId: number;
let otherDoctorId: number;
let patientId: number;
let treatmentTypeId: number;

before(async () => {
  dbClient = await import("@/lib/db/client");
  schema = await import("@/lib/db/schema");
  const mutations = await import("@/lib/mutations");
  recordCasePayment = mutations.recordCasePayment;
  createCaseWithPayment = mutations.createCaseWithPayment;
  updateCaseMeta = mutations.updateCaseMeta;
  deletePayment = mutations.deletePayment;

  migrate(dbClient.db, { migrationsFolder: path.resolve("drizzle") });
  doctorId = Number(
    dbClient.db.insert(schema.doctors).values({ name: "د. الحالة", sortOrder: 1 }).run()
      .lastInsertRowid,
  );
  otherDoctorId = Number(
    dbClient.db.insert(schema.doctors).values({ name: "د. آخر", sortOrder: 2 }).run()
      .lastInsertRowid,
  );
  patientId = Number(
    dbClient.db.insert(schema.patients).values({ fullName: "مريض اختبار" }).run()
      .lastInsertRowid,
  );
  treatmentTypeId = Number(
    dbClient.db
      .insert(schema.treatmentTypes)
      .values({
        key: "payment_test",
        nameAr: "اختبار",
        nameEn: "Test",
        settlementBucket: "normal",
      })
      .run().lastInsertRowid,
  );
});

function createCase(totalPrice = 1_000): number {
  return Number(
    dbClient.db
      .insert(schema.cases)
      .values({
        patientId,
        doctorId,
        treatmentTypeId,
        openedDate: "2026-07-19",
        listPrice: totalPrice,
        totalPrice,
      })
      .run().lastInsertRowid,
  );
}

after(() => {
  dbClient.sqlite.close();
  rmSync(testDir, { recursive: true, force: true });
});

test("collection derives the doctor and rejects an overpayment", () => {
  const caseId = createCase();
  const first = recordCasePayment({
    caseId,
    amount: 600,
    kind: "session",
    paidDate: "2026-07-19",
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.remaining, 400);

  const stored = dbClient.db
    .select()
    .from(schema.payments)
    .where(eq(schema.payments.id, first.paymentId))
    .get();
  assert.equal(stored?.doctorId, doctorId);
  assert.notEqual(stored?.doctorId, otherDoctorId);

  assert.deepEqual(
    recordCasePayment({
      caseId,
      amount: 401,
      kind: "session",
      paidDate: "2026-07-19",
    }),
    { ok: false, reason: "exceeds_remaining" },
  );
});

test("refunds are signed server-side and cannot exceed net paid", () => {
  const caseId = createCase();
  assert.equal(
    recordCasePayment({ caseId, amount: 600, paidDate: "2026-07-19" }).ok,
    true,
  );
  assert.deepEqual(
    recordCasePayment({
      caseId,
      amount: 601,
      kind: "refund",
      paidDate: "2026-07-20",
    }),
    { ok: false, reason: "refund_exceeds_paid" },
  );

  const refund = recordCasePayment({
    caseId,
    amount: 250,
    kind: "refund",
    paidDate: "2026-07-20",
  });
  assert.equal(refund.ok, true);
  if (!refund.ok) return;
  assert.equal(refund.amount, -250);
  assert.equal(refund.remaining, 650);
});

// A finished treatment can still carry a balance the clinic is chasing, so
// "completed" must keep accepting money — only "cancelled" refuses it. [A4]
test("a completed case still accepts collection but a cancelled one does not", () => {
  const completedCase = createCase();
  dbClient.db
    .update(schema.cases)
    .set({ status: "completed" })
    .where(eq(schema.cases.id, completedCase))
    .run();

  const collected = recordCasePayment({
    caseId: completedCase,
    amount: 100,
    paidDate: "2026-07-19",
  });
  assert.equal(collected.ok, true);
  if (!collected.ok) return;
  assert.equal(collected.remaining, 900);

  const cancelledCase = createCase();
  dbClient.db
    .update(schema.cases)
    .set({ status: "cancelled" })
    .where(eq(schema.cases.id, cancelledCase))
    .run();

  assert.deepEqual(
    recordCasePayment({ caseId: cancelledCase, amount: 100, paidDate: "2026-07-19" }),
    { ok: false, reason: "case_cancelled" },
  );
});

// Voiding is the correction path for a typo; a refund is a real money event.
// The voided row must survive in the audit log. [A1]
test("voiding a mis-entered payment removes it and leaves an audit trail", () => {
  const caseId = createCase();
  const entered = recordCasePayment({ caseId, amount: 500, paidDate: "2026-07-19" });
  assert.equal(entered.ok, true);
  if (!entered.ok) return;

  assert.equal(deletePayment(entered.paymentId), true);
  assert.equal(
    dbClient.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, entered.paymentId))
      .get(),
    undefined,
  );

  const trail = dbClient.db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.entity, "payments"))
    .all()
    .filter((row) => row.action === "delete" && row.entityId === entered.paymentId);
  assert.equal(trail.length, 1);
  assert.match(String(trail[0].beforeJson), /500/);

  // Voiding the same row twice is a no-op, not a crash.
  assert.equal(deletePayment(entered.paymentId), false);
});

test("course-specific adapters cannot mutate a different treatment variant", () => {
  const caseId = createCase();

  assert.deepEqual(
    recordCasePayment({
      caseId,
      amount: 100,
      paidDate: "2026-07-19",
      expectedCourse: "implant",
    }),
    { ok: false, reason: "wrong_course" },
  );
  assert.equal(updateCaseMeta(caseId, { notes: "must not be written" }, "implant"), false);
  assert.equal(
    dbClient.db.select().from(schema.cases).where(eq(schema.cases.id, caseId)).get()?.notes,
    null,
  );
});

test("case totals cannot be reduced below the amount already paid", () => {
  const caseId = createCase();
  assert.equal(
    recordCasePayment({ caseId, amount: 600, paidDate: "2026-07-19" }).ok,
    true,
  );
  assert.equal(updateCaseMeta(caseId, { totalPrice: 599 }, "ordinary"), false);
  assert.equal(
    dbClient.db.select().from(schema.cases).where(eq(schema.cases.id, caseId)).get()?.totalPrice,
    1_000,
  );
});

test("calendar-invalid dates are rejected", () => {
  const caseId = createCase();
  assert.deepEqual(
    recordCasePayment({ caseId, amount: 100, paidDate: "2026-02-31" }),
    { ok: false, reason: "invalid_date" },
  );
});

test("an audit failure rolls the payment back", () => {
  const caseId = createCase();
  dbClient.sqlite.exec(`
    create trigger fail_payment_audit
    before insert on audit_log
    when new.entity = 'payments'
    begin
      select raise(abort, 'forced payment audit failure');
    end;
  `);

  assert.throws(
    () => recordCasePayment({ caseId, amount: 100, paidDate: "2026-07-19" }),
    /forced payment audit failure/,
  );
  dbClient.sqlite.exec("drop trigger fail_payment_audit");

  const count = dbClient.db
    .select({ value: sql<number>`count(*)` })
    .from(schema.payments)
    .where(eq(schema.payments.caseId, caseId))
    .get()?.value;
  assert.equal(count, 0);
});

test("a first payment cannot create an already-overpaid case", () => {
  const countBefore = dbClient.db
    .select({ value: sql<number>`count(*)` })
    .from(schema.cases)
    .get()!.value;

  assert.throws(
    () =>
      createCaseWithPayment({
        patientId,
        doctorId,
        treatmentTypeId,
        openedDate: "2026-07-19",
        listPrice: 1_000,
        discount: 0,
        totalPrice: 1_000,
        firstPayment: { amount: 1_001 },
      }),
    /Initial payment violates the case balance/,
  );

  const countAfter = dbClient.db
    .select({ value: sql<number>`count(*)` })
    .from(schema.cases)
    .get()!.value;
  assert.equal(countAfter, countBefore);
});
