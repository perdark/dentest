import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";

// «+ طبيب آخر»: one treatment shared by several doctors becomes one ordinary
// case per doctor, written all-or-nothing. [2026-10-25]
const testDir = mkdtempSync(path.join(tmpdir(), "zuha-multidoc-"));
process.env.ZUHA_DB = path.join(testDir, "multidoc.db");

let dbClient: typeof import("@/lib/db/client");
let schema: typeof import("@/lib/db/schema");
let mutations: typeof import("@/lib/mutations");
let settlement: typeof import("@/lib/settlement");
let parseCaseShares: typeof import("@/lib/case-shares")["parseCaseShares"];
let doctorA: number;
let doctorB: number;
let doctorC: number;
let patientId: number;
let treatmentTypeId: number;

const DAY = "2026-07-19";
const PERIOD = "2026-07";

before(async () => {
  dbClient = await import("@/lib/db/client");
  schema = await import("@/lib/db/schema");
  mutations = await import("@/lib/mutations");
  settlement = await import("@/lib/settlement");
  parseCaseShares = (await import("@/lib/case-shares")).parseCaseShares;

  migrate(dbClient.db, { migrationsFolder: path.resolve("drizzle") });
  const doctor = (name: string, sortOrder: number) =>
    Number(
      dbClient.db.insert(schema.doctors).values({ name, sortOrder, commissionPct: 50 }).run()
        .lastInsertRowid,
    );
  doctorA = doctor("د. أ", 1);
  doctorB = doctor("د. ب", 2);
  doctorC = doctor("د. ج", 3);
  patientId = Number(
    dbClient.db.insert(schema.patients).values({ fullName: "مريض مشترك" }).run().lastInsertRowid,
  );
  treatmentTypeId = Number(
    dbClient.db
      .insert(schema.treatmentTypes)
      .values({ key: "shared_test", nameAr: "جسر", nameEn: "Bridge", settlementBucket: "normal" })
      .run().lastInsertRowid,
  );
});

after(() => {
  dbClient.sqlite.close();
  rmSync(testDir, { recursive: true, force: true });
});

function counts() {
  return {
    cases: dbClient.db.select().from(schema.cases).all().length,
    payments: dbClient.db.select().from(schema.payments).all().length,
    audit: dbClient.db.select().from(schema.auditLog).all().length,
  };
}

function doctorRow(id: number) {
  const row = settlement.computeSettlement(PERIOD).doctors.find((d) => d.doctorId === id);
  assert.ok(row, `doctor ${id} missing from the settlement`);
  return row;
}

test("two doctors → two ordinary cases, each with its own share", () => {
  const before = counts();
  const result = mutations.createSharedCases({
    patientId,
    treatmentTypeId,
    openedDate: DAY,
    shares: [
      { doctorId: doctorA, listPrice: 300_000, paidNow: 200_000 },
      { doctorId: doctorB, listPrice: 100_000, paidNow: 50_000 },
    ],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.caseIds.length, 2);

  const [a, b] = result.caseIds.map(
    (id) => dbClient.db.select().from(schema.cases).where(eq(schema.cases.id, id)).get()!,
  );
  assert.deepEqual(
    [a.doctorId, a.patientId, a.treatmentTypeId, a.openedDate, a.totalPrice],
    [doctorA, patientId, treatmentTypeId, DAY, 300_000],
  );
  assert.deepEqual(
    [b.doctorId, b.patientId, b.treatmentTypeId, b.openedDate, b.totalPrice],
    [doctorB, patientId, treatmentTypeId, DAY, 100_000],
  );

  const pays = dbClient.db.select().from(schema.payments).all();
  assert.deepEqual(
    pays.map((p) => [p.caseId, p.doctorId, p.amount]).sort((x, y) => x[0] - y[0]),
    [
      [a.id, doctorA, 200_000],
      [b.id, doctorB, 50_000],
    ],
  );

  // Same audit trail as two single saves: a case insert + a payment insert each.
  const after = counts();
  assert.equal(after.cases - before.cases, 2);
  assert.equal(after.payments - before.payments, 2);
  assert.equal(after.audit - before.audit, 4);
});

test("each doctor's settlement sees only their own share; total = sum of rows", () => {
  const result = settlement.computeSettlement(PERIOD);
  assert.equal(doctorRow(doctorA).collectedTotal, 200_000);
  assert.equal(doctorRow(doctorB).collectedTotal, 50_000);
  assert.equal(doctorRow(doctorC).collectedTotal, 0);
  assert.equal(result.totalCollected, 250_000);
});

test("one bad row rolls the whole treatment back", () => {
  const before = counts();
  // Row 2 names a doctor that does not exist: the first case is already
  // written inside the transaction when the second insert fails.
  assert.throws(() =>
    mutations.createSharedCases({
      patientId,
      treatmentTypeId,
      openedDate: DAY,
      shares: [
        { doctorId: doctorC, listPrice: 80_000, paidNow: 80_000 },
        { doctorId: 999_999, listPrice: 20_000, paidNow: 0 },
      ],
    }),
  );
  assert.deepEqual(counts(), before);
  assert.equal(doctorRow(doctorC).collectedTotal, 0);

  // A chart the mutations layer refuses also rolls back every share.
  const chart = mutations.createSharedCases({
    patientId,
    treatmentTypeId,
    openedDate: DAY,
    shares: [
      { doctorId: doctorA, listPrice: 1_000, paidNow: 0 },
      { doctorId: doctorC, listPrice: 1_000, paidNow: 0 },
    ],
    marks: [{ scope: "tooth", toothCode: 999 }],
  });
  assert.deepEqual(chart, { ok: false, reason: "bad_tooth_code" });
  assert.deepEqual(counts(), before);
});

test("a share that would be refused on its own is refused here", () => {
  const before = counts();
  const base = { patientId, treatmentTypeId, openedDate: DAY };
  const refuse = (shares: Parameters<typeof mutations.createSharedCases>[0]["shares"]) =>
    mutations.createSharedCases({ ...base, shares });

  assert.deepEqual(refuse([]), { ok: false, reason: "no_shares" });
  assert.deepEqual(
    refuse([
      { doctorId: doctorA, listPrice: 1_000, paidNow: 0 },
      { doctorId: doctorA, listPrice: 1_000, paidNow: 0 },
    ]),
    { ok: false, reason: "duplicate_doctor" },
  );
  assert.deepEqual(
    refuse([
      { doctorId: doctorA, listPrice: 1_000, paidNow: 0 },
      { doctorId: doctorB, listPrice: 1_000, paidNow: 1_001 },
    ]),
    { ok: false, reason: "paid_exceeds_price" },
  );
  assert.deepEqual(
    refuse([
      { doctorId: doctorA, listPrice: -5, paidNow: 0 },
      { doctorId: doctorB, listPrice: 1_000, paidNow: 0 },
    ]),
    { ok: false, reason: "invalid_amount" },
  );
  assert.deepEqual(counts(), before);

  // A free session (0 typed) is a valid share, exactly as on a single save.
  const free = refuse([
    { doctorId: doctorA, listPrice: 0, paidNow: 0 },
    { doctorId: doctorB, listPrice: 5_000, paidNow: 5_000 },
  ]);
  assert.equal(free.ok, true);
});

test("the form parser recomputes every row and refuses bad ones", () => {
  const form = (rows: [string, string, string][], extra: Record<string, string> = {}) => {
    const fd = new FormData();
    for (const [doc, price, paid] of rows) {
      fd.append("shareDoctorId", doc);
      fd.append("sharePrice", price);
      fd.append("sharePaid", paid);
    }
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    return fd;
  };

  // One doctor: the form sends no share fields and the old path runs.
  assert.equal(parseCaseShares(form([], { doctorId: "1", price: "5000" })), null);

  const ok = parseCaseShares(
    form([
      [String(doctorA), "300,000", "٢٠٠٬٠٠٠"],
      [String(doctorB), "100k", ""],
    ]),
  );
  assert.deepEqual(ok, {
    ok: true,
    shares: [
      { doctorId: doctorA, listPrice: 300_000, discount: 0, paidNow: 200_000 },
      { doctorId: doctorB, listPrice: 100_000, discount: 0, paidNow: 0 },
    ],
  });

  const refused = (rows: [string, string, string][]) => {
    const r = parseCaseShares(form(rows));
    assert.ok(r && !r.ok, JSON.stringify(rows));
  };
  refused([[String(doctorA), "", "0"], [String(doctorB), "1000", "0"]]); // empty row
  refused([[String(doctorA), "abc", "0"], [String(doctorB), "1000", "0"]]); // unreadable price
  refused([[String(doctorA), "1000", "0"], [String(doctorA), "1000", "0"]]); // same doctor twice
  refused([[String(doctorA), "1000", "1500"], [String(doctorB), "1000", "0"]]); // paid > price
  refused([["", "1000", "0"], [String(doctorB), "1000", "0"]]); // no doctor
});
