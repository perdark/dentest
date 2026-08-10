import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq, sql } from "drizzle-orm";

const testDir = mkdtempSync(path.join(tmpdir(), "dentest-audit-"));
process.env.DENTEST_DB = path.join(testDir, "audit.db");

let dbClient: typeof import("@/lib/db/client");
let schema: typeof import("@/lib/db/schema");
let addExpense: typeof import("@/lib/mutations")["addExpense"];
let findOrCreatePatient: typeof import("@/lib/mutations")["findOrCreatePatient"];
let settlementId: number;

before(async () => {
  dbClient = await import("@/lib/db/client");
  schema = await import("@/lib/db/schema");
  const mutations = await import("@/lib/mutations");
  addExpense = mutations.addExpense;
  findOrCreatePatient = mutations.findOrCreatePatient;

  migrate(dbClient.db, { migrationsFolder: path.resolve("drizzle") });
  const doctorId = Number(
    dbClient.db.insert(schema.doctors).values({ name: "د. تدقيق" }).run().lastInsertRowid,
  );
  settlementId = Number(
    dbClient.db
      .insert(schema.monthlySettlements)
      .values({ period: "2026-07", doctorId, status: "closed", closedAt: Date.now() })
      .run().lastInsertRowid,
  );
});

after(() => {
  dbClient.sqlite.close();
  rmSync(testDir, { recursive: true, force: true });
});

test("record, audit, and closed-period staleness roll back together", () => {
  dbClient.sqlite.exec(`
    create trigger fail_stale_transition
    before update on monthly_settlements
    when new.status = 'stale'
    begin
      select raise(abort, 'forced staleness failure');
    end;
  `);

  assert.throws(
    () =>
      addExpense({
        expenseDate: "2026-07-19",
        category: "other",
        amount: 25_000,
      }),
    /forced staleness failure/,
  );
  dbClient.sqlite.exec("drop trigger fail_stale_transition");

  const expenseCount = dbClient.db
    .select({ value: sql<number>`count(*)` })
    .from(schema.expenses)
    .get()!.value;
  const auditCount = dbClient.db
    .select({ value: sql<number>`count(*)` })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.entity, "expenses"))
    .get()!.value;
  const settlement = dbClient.db
    .select()
    .from(schema.monthlySettlements)
    .where(eq(schema.monthlySettlements.id, settlementId))
    .get();

  assert.equal(expenseCount, 0);
  assert.equal(auditCount, 0);
  assert.equal(settlement?.status, "closed");
});

test("blank-phone namesakes remain separate while exact phone identities reuse", () => {
  const firstNamesake = findOrCreatePatient({ fullName: "علي حسن" });
  const secondNamesake = findOrCreatePatient({ fullName: "علي حسن" });
  assert.notEqual(firstNamesake, secondNamesake);

  const firstWithPhone = findOrCreatePatient({ fullName: "سارة كريم", phone: "07701234567" });
  const sameWithPhone = findOrCreatePatient({ fullName: "سارة كريم", phone: "07701234567" });
  assert.equal(firstWithPhone, sameWithPhone);
});
