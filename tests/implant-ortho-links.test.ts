import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";

/*
 * Implant card ↔ patient file, ortho «الموعد القادم» ↔ «المواعيد» (2026-09-27).
 * The card's address lives on the patient, and an ortho next appointment is a
 * real booking that moves with the date instead of piling up duplicates.
 */

const testDir = mkdtempSync(path.join(tmpdir(), "zuha-links-"));
process.env.ZUHA_DB = path.join(testDir, "links.db");

let dbClient: typeof import("@/lib/db/client");
let schema: typeof import("@/lib/db/schema");
let m: typeof import("@/lib/mutations");
let dates: typeof import("@/lib/dates");
let drA: number;
let implantType: number;
let orthoType: number;

before(async () => {
  dbClient = await import("@/lib/db/client");
  schema = await import("@/lib/db/schema");
  m = await import("@/lib/mutations");
  dates = await import("@/lib/dates");
  migrate(dbClient.db, { migrationsFolder: path.resolve("drizzle") });

  const id = (r: { lastInsertRowid: number | bigint }) => Number(r.lastInsertRowid);
  drA = id(dbClient.db.insert(schema.doctors).values({ name: "د. أ" }).run());
  implantType = id(dbClient.db.insert(schema.treatmentTypes).values({
    key: "implant_t",
    nameAr: "زراعة",
    nameEn: "Implant",
    settlementBucket: "implant",
    isImplant: true,
  }).run());
  orthoType = id(dbClient.db.insert(schema.treatmentTypes).values({
    key: "ortho_t",
    nameAr: "تقويم",
    nameEn: "Ortho",
    settlementBucket: "ortho",
    isOrtho: true,
  }).run());
});

beforeEach(() => {
  const d = dbClient.db;
  d.delete(schema.payments).run();
  d.delete(schema.appointments).run();
  d.delete(schema.cases).run();
  d.delete(schema.patients).run();
  d.delete(schema.auditLog).run();
});

after(() => {
  dbClient.sqlite.close();
  rmSync(testDir, { recursive: true, force: true });
});

function openCase(type: number, opts: { address?: string | null; total?: number } = {}) {
  const patientId = m.createPatient({ fullName: "مريض اختبار", address: opts.address ?? null });
  const caseId = m.createCase({
    patientId,
    doctorId: drA,
    treatmentTypeId: type,
    openedDate: "2026-07-10",
    listPrice: opts.total ?? 0,
    discount: 0,
    totalPrice: opts.total ?? 0,
    address: "عنوان البطاقة القديم",
    labCost: 40_000,
  });
  return { patientId, caseId };
}

const patientAddress = (id: number) =>
  dbClient.db.select().from(schema.patients).where(eq(schema.patients.id, id)).get()!.address;
const caseRow = (id: number) =>
  dbClient.db.select().from(schema.cases).where(eq(schema.cases.id, id)).get()!;
const appts = (patientId: number) =>
  dbClient.db
    .select()
    .from(schema.appointments)
    .where(eq(schema.appointments.patientId, patientId))
    .all();

/** A date `days` after today, as YYYY-MM-DD. */
function inDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return dates.todayISO(d);
}

// ── Implant card address ────────────────────────────────────────────────────
test("editing the card's address writes the patient's address (and the snapshot)", () => {
  const { patientId, caseId } = openCase(implantType, { address: "الكرادة", total: 500_000 });
  const ok = m.updateImplantCardRecord(
    caseId,
    { listPrice: 500_000, discount: 0, totalPrice: 500_000, status: "open", notes: null },
    "المنصور",
  );
  assert.equal(ok, true);
  assert.equal(patientAddress(patientId), "المنصور");
  assert.equal(caseRow(caseId).addressSnapshot, "المنصور");
});

test("a refused card edit leaves the patient's address untouched", () => {
  const { patientId, caseId } = openCase(implantType, { address: "الكرادة", total: 500_000 });
  assert.ok(m.recordCasePayment({ caseId, amount: 300_000, paidDate: "2026-07-10" }).ok);
  // الإجمالي تحت المدفوع — يُرفض، والعنوان معه.
  const ok = m.updateImplantCardRecord(
    caseId,
    { listPrice: 100_000, discount: 0, totalPrice: 100_000, status: "open", notes: null },
    "المنصور",
  );
  assert.equal(ok, false);
  assert.equal(patientAddress(patientId), "الكرادة");
});

test("a card edit without labCost keeps the stored lab cost; without address keeps both addresses", () => {
  const { patientId, caseId } = openCase(implantType, { address: "الكرادة", total: 500_000 });
  const ok = m.updateImplantCardRecord(caseId, {
    listPrice: 500_000,
    discount: 0,
    totalPrice: 500_000,
    status: "open",
    notes: null,
  });
  assert.equal(ok, true);
  assert.equal(caseRow(caseId).labCost, 40_000);
  assert.equal(caseRow(caseId).addressSnapshot, "عنوان البطاقة القديم");
  assert.equal(patientAddress(patientId), "الكرادة");
});

test("the card edit refuses a non-implant case", () => {
  const { caseId } = openCase(orthoType);
  assert.equal(
    m.updateImplantCardRecord(caseId, { status: "open" }, "المنصور"),
    false,
  );
});

// ── Ortho next appointment ──────────────────────────────────────────────────
test("setting the ortho next appointment books it in «المواعيد» with the case doctor", () => {
  const { patientId, caseId } = openCase(orthoType);
  const day = inDays(10);
  assert.equal(m.setOrthoNextAppointment(caseId, day), true);
  assert.equal(caseRow(caseId).nextAppointment, day);
  const rows = appts(patientId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].apptDate, day);
  assert.equal(rows[0].doctorId, drA);
  assert.equal(rows[0].status, "booked");
});

test("changing a future date moves the booking instead of duplicating it", () => {
  const { patientId, caseId } = openCase(orthoType);
  m.setOrthoNextAppointment(caseId, inDays(10));
  m.setOrthoNextAppointment(caseId, inDays(17));
  const rows = appts(patientId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].apptDate, inDays(17));
});

test("saving the same date again books nothing new", () => {
  const { patientId, caseId } = openCase(orthoType);
  m.setOrthoNextAppointment(caseId, inDays(10));
  m.setOrthoNextAppointment(caseId, inDays(10));
  assert.equal(appts(patientId).length, 1);
});

test("today's booking is kept (it is the visit happening now) and the next one is added", () => {
  const { patientId, caseId } = openCase(orthoType);
  const today = dates.todayISO();
  m.setOrthoNextAppointment(caseId, today);
  m.setOrthoNextAppointment(caseId, inDays(30));
  const days = appts(patientId).map((a) => a.apptDate).sort();
  assert.deepEqual(days, [today, inDays(30)]);
});

test("a date already booked by hand in «المواعيد» is not booked twice", () => {
  const { patientId, caseId } = openCase(orthoType);
  m.createAppointment({ patientId, doctorId: drA, apptDate: inDays(5) });
  m.setOrthoNextAppointment(caseId, inDays(5));
  assert.equal(appts(patientId).length, 1);
});

test("clearing the date removes its future booking", () => {
  const { patientId, caseId } = openCase(orthoType);
  m.setOrthoNextAppointment(caseId, inDays(10));
  assert.equal(m.setOrthoNextAppointment(caseId, null), true);
  assert.equal(caseRow(caseId).nextAppointment, null);
  assert.equal(appts(patientId).length, 0);
});

test("a booking already marked «حضر» is never moved", () => {
  const { patientId, caseId } = openCase(orthoType);
  m.setOrthoNextAppointment(caseId, inDays(10));
  const [row] = appts(patientId);
  m.setAppointmentStatus(row.id, "came");
  m.setOrthoNextAppointment(caseId, inDays(20));
  const days = appts(patientId).map((a) => a.apptDate).sort();
  assert.deepEqual(days, [inDays(10), inDays(20)]);
});

test("the ortho appointment refuses a non-ortho case and a non-date", () => {
  const { patientId, caseId } = openCase(implantType, { total: 100_000 });
  assert.equal(m.setOrthoNextAppointment(caseId, inDays(3)), false);
  const ortho = openCase(orthoType);
  assert.equal(m.setOrthoNextAppointment(ortho.caseId, "2026-02-30"), false);
  assert.equal(appts(patientId).length + appts(ortho.patientId).length, 0);
});
