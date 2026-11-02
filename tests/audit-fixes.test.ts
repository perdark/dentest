import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { normalizeArabic } from "@/lib/arabic";

// Fixes from the 2026-10-28 audit of the clinic's records: ortho money on the
// wrong doctor, «زراعه» and «توصيل مبلغ» typed as ordinary treatments, a
// duplicate patient file per spelling, and old notebook payments counted as
// cash in the drawer.
const testDir = mkdtempSync(path.join(tmpdir(), "zuha-audit-fixes-"));
process.env.ZUHA_DB = path.join(testDir, "audit-fixes.db");

let dbClient: typeof import("@/lib/db/client");
let schema: typeof import("@/lib/db/schema");
let mutations: typeof import("@/lib/mutations");
let settlement: typeof import("@/lib/settlement");
let queries: typeof import("@/lib/queries");
let serverUtils: typeof import("@/lib/server-utils");
let owner: number;
let orthoDoctor: number;
let patientId: number;
let orthoType: number;

before(async () => {
  dbClient = await import("@/lib/db/client");
  schema = await import("@/lib/db/schema");
  mutations = await import("@/lib/mutations");
  settlement = await import("@/lib/settlement");
  queries = await import("@/lib/queries");
  serverUtils = await import("@/lib/server-utils");

  migrate(dbClient.db, { migrationsFolder: path.resolve("drizzle") });
  owner = Number(
    dbClient.db
      .insert(schema.doctors)
      .values({ name: "د. المالك", sortOrder: 1, commissionPct: 0, isOwner: true, doesOrtho: true })
      .run().lastInsertRowid,
  );
  orthoDoctor = Number(
    dbClient.db
      .insert(schema.doctors)
      .values({ name: "د. التقويم", sortOrder: 5, commissionPct: 30, doesOrtho: true })
      .run().lastInsertRowid,
  );
  patientId = Number(
    dbClient.db.insert(schema.patients).values({ fullName: "سبأ فائق" }).run().lastInsertRowid,
  );
  const type = (key: string, nameAr: string, bucket: "normal" | "implant" | "ortho" | "xray", flags = {}) =>
    Number(
      dbClient.db
        .insert(schema.treatmentTypes)
        .values({ key, nameAr, nameEn: key, settlementBucket: bucket, ...flags })
        .run().lastInsertRowid,
    );
  type("implant", "زراعة", "implant", { isImplant: true });
  orthoType = type("ortho", "تقويم", "ortho", { isOrtho: true });
  type("xray_panoramic", "أشعة بانوراما", "xray");
  type("filling", "حشوة", "normal");
});

after(() => {
  dbClient.sqlite.close();
  rmSync(testDir, { recursive: true, force: true });
});

test("normalizeArabic folds the spellings the clinic mixes", () => {
  assert.equal(normalizeArabic("زراعة"), normalizeArabic("زراعه"));
  assert.equal(normalizeArabic("سبأ  فائق"), "سبا فائق");
  assert.equal(normalizeArabic("مستشفى"), normalizeArabic("مستشفي"));
  assert.equal(normalizeArabic("حَشْوَة"), "حشوه");
});

test("an implant or ortho spelled another way is refused from the daily entry", () => {
  for (const name of ["زراعه", "زراعة", "زرعه", "زراعة اسنان"]) {
    assert.deepEqual(mutations.findOrCreateTreatmentType(name), {
      ok: false,
      reason: "implant_record",
    }, name);
  }
  for (const name of ["تقويم", "تقويم اسنان", "تقويم الأسنان"]) {
    assert.deepEqual(mutations.findOrCreateTreatmentType(name), {
      ok: false,
      reason: "ortho_record",
    }, name);
  }
  assert.deepEqual(mutations.findOrCreateTreatmentType("اشعة بانوراما"), {
    ok: false,
    reason: "xray_record",
  });
  // An ordinary treatment that merely contains the word stays allowed.
  const cleaning = mutations.findOrCreateTreatmentType("تنظيف تقويمي");
  assert.equal(cleaning.ok, true);
});

test("an old normal row spelled «زراعه» is refused, not reused", () => {
  dbClient.db
    .insert(schema.treatmentTypes)
    .values({ key: "custom_old", nameAr: "زراعه", nameEn: "زراعه", settlementBucket: "normal" })
    .run();
  assert.deepEqual(mutations.findOrCreateTreatmentType("زراعه"), {
    ok: false,
    reason: "implant_record",
  });
});

test("a payment on an old account is refused as a treatment", () => {
  for (const name of ["توصيل مبلغ", "توصيل دين", "قسط ماستر", "رفع خيط وتوصيل مبلغ", "توصيل مبلغ ع ماستر د عدي"]) {
    assert.deepEqual(mutations.findOrCreateTreatmentType(name), {
      ok: false,
      reason: "payment_record",
    }, name);
  }
});

test("«حشوه» reuses the existing «حشوة» instead of adding a twin", () => {
  const filling = dbClient.db
    .select()
    .from(schema.treatmentTypes)
    .where(eq(schema.treatmentTypes.key, "filling"))
    .get()!;
  assert.deepEqual(mutations.findOrCreateTreatmentType("حشوه"), {
    ok: true,
    id: filling.id,
    created: false,
  });
});

test("an ortho case moves to its real doctor with its payments; the closed month goes stale", () => {
  const { caseId } = mutations.createCaseWithPayment({
    patientId,
    doctorId: owner,
    treatmentTypeId: orthoType,
    openedDate: "2026-09-05",
    listPrice: 0,
    discount: 0,
    totalPrice: 0,
    downPaymentAgreed: 1_000_000,
    firstPayment: { amount: 500_000, kind: "down_payment" },
  });
  const session = mutations.recordCasePayment({
    caseId,
    amount: 100_000,
    kind: "session",
    paidDate: "2026-10-03",
  });
  assert.equal(session.ok, true);
  settlement.closeSettlement("2026-09");

  const ortho = (period: string, id: number) =>
    settlement.computeSettlement(period).doctors.find((d) => d.doctorId === id)!;
  assert.equal(ortho("2026-09", owner).collectedOrtho, 500_000);
  assert.equal(ortho("2026-09", orthoDoctor).payout, 0);

  const moved = mutations.reassignCaseDoctor(caseId, orthoDoctor);
  assert.deepEqual(moved, { ok: true, moved: { count: 2, total: 600_000 } });

  const sep = settlement.computeSettlement("2026-09");
  assert.equal(sep.anyStale, true);
  const sepDoctor = sep.doctors.find((d) => d.doctorId === orthoDoctor)!;
  assert.equal(sepDoctor.collectedOrtho, 500_000);
  assert.equal(sepDoctor.payout, 150_000); // 30%
  assert.equal(ortho("2026-10", orthoDoctor).payout, 30_000);
  assert.equal(ortho("2026-10", owner).collectedOrtho, 0);

  const c = dbClient.db.select().from(schema.cases).where(eq(schema.cases.id, caseId)).get()!;
  assert.equal(c.doctorId, orthoDoctor);
  assert.equal(c.downPaymentAgreed, 1_000_000);

  assert.deepEqual(mutations.reassignCaseDoctor(caseId, orthoDoctor), {
    ok: false,
    reason: "same_doctor",
  });
  assert.deepEqual(mutations.reassignCaseDoctor(caseId, 9999), {
    ok: false,
    reason: "doctor_not_found",
  });
});

test("patient search ignores أ/ا and ة/ه, so the existing file is found", () => {
  // Typed without the hamza; the file was saved as «سبأ فائق».
  const found = queries.patientsList({ q: "سبا فائق" });
  assert.equal(found.some((p) => p.id === patientId), true);
});

test("cash on hand counts only from the start date when one is set", () => {
  // Records so far: 500,000 (2026-09-05) + 100,000 (2026-10-03).
  assert.equal(serverUtils.cashOnHand(), 600_000);
  mutations.updateSettings({ cashStartDate: "2026-10-01", openingCashBalance: 2_000_000 });
  assert.equal(serverUtils.cashOnHand(), 2_100_000);
  mutations.updateSettings({ cashStartDate: null, openingCashBalance: 0 });
  assert.equal(serverUtils.cashOnHand(), 600_000);
});
