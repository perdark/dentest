import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/**
 * الاستعادة — الزر الوحيد الذي يستطيع أن يمحو سجلات عيادة.
 *
 * ⚠️ الاستعادة لا تحدث في مكانها: `better-sqlite3` يمسك الملف مفتوحاً ما دام
 * البرنامج يعمل، فالاستبدال الآن يترك كل شاشة تقرأ ملفاً لم يعد موجوداً. لذلك
 * النسخة تُجهَّز في ملف معلّق، و`applyPendingRestore()` يبدّلها قبل فتح أي
 * اتصال — وهو ما يحاكيه هذا الاختبار حرفياً.
 *
 * 🔴 أخطر تفصيل هنا هو ملفات WAL: الـ`-wal` يخصّ القاعدة **المستبدَلة**، فلو بقي
 * بجانب الملف المستعاد لأعاد SQLite تشغيله فوقه وأعاد كتابة الصفوف نفسها التي
 * استعادت العيادةُ النسخةَ لتتخلّص منها. الاختبار الأخير يحرس ذلك.
 */

const testDir = mkdtempSync(path.join(tmpdir(), "zuha-restore-"));
const DB = path.join(testDir, "clinic.db");
process.env.ZUHA_DB = DB;
process.env.ZUHA_QUIET = "1";

const BACKUP = path.join(testDir, "zuha-2026-08-28T10-00-00-000Z.db");

let paths: typeof import("@/lib/paths");
let dbClient: typeof import("@/lib/db/client");

const patientNames = (file: string): string[] => {
  const conn = new Database(file, { readonly: true });
  try {
    return (conn.prepare("select full_name as n from patients order by id").all() as {
      n: string;
    }[]).map((r) => r.n);
  } finally {
    conn.close();
  }
};

before(async () => {
  paths = await import("@/lib/paths");
  dbClient = await import("@/lib/db/client");
  const { seed } = await import("@/lib/db/seed");
  const m = await import("@/lib/mutations");

  migrate(dbClient.db, { migrationsFolder: path.resolve("drizzle") });
  seed();

  // The state the clinic will later want back.
  m.createPatient({ fullName: "مريض قبل النسخة" });
  // ⚠️ `backup()` returns a promise. Un-awaited, the copy is still running
  // while the next row is inserted and the "backup" captures it too.
  await dbClient.sqlite.backup(BACKUP);

  // …then more work happens on top of it.
  m.createPatient({ fullName: "مريض بعد النسخة" });
});

after(() => {
  // A test below closes the connection to imitate a restart; closing twice throws.
  if (dbClient.sqlite.open) dbClient.sqlite.close();
  rmSync(testDir, { recursive: true, force: true });
});

test("the backup is a standalone database, not a file needing its -wal", () => {
  assert.ok(existsSync(BACKUP), "النسخة كُتبت");
  assert.deepEqual(
    patientNames(BACKUP),
    ["مريض قبل النسخة"],
    "النسخة تحمل حالة العيادة لحظة أخذها، مكتملةً بلا ملفات جانبية",
  );
});

test("staging a restore changes nothing until the next start", () => {
  copyFileSync(BACKUP, paths.pendingRestorePath());

  assert.deepEqual(
    patientNames(DB),
    ["مريض قبل النسخة", "مريض بعد النسخة"],
    "🔴 السجلات الحيّة لا تُمسّ بمجرّد التجهيز — البرنامج ما زال يعمل عليها",
  );
});

test("the next start applies it, and the clinic gets its records back", () => {
  // What `lib/db/client.ts` does before it opens a connection.
  dbClient.sqlite.close();
  const applied = paths.applyPendingRestore();

  assert.equal(applied, true, "الاستعادة طُبِّقت");
  assert.deepEqual(
    patientNames(DB),
    ["مريض قبل النسخة"],
    "العيادة عادت إلى ما كانت عليه يوم النسخة",
  );
  assert.equal(
    existsSync(paths.pendingRestorePath()),
    false,
    "الملف المعلّق استُهلك فلا تتكرّر الاستعادة كل تشغيل",
  );
});

test("a start with nothing staged is a no-op", () => {
  assert.equal(paths.applyPendingRestore(), false);
  assert.deepEqual(patientNames(DB), ["مريض قبل النسخة"], "لا شيء تغيّر");
});

test("stale WAL sidecars cannot replay over the restored database", () => {
  // A -wal left from the replaced database. If it survived the swap, SQLite
  // would try to recover it onto the restored file on the next open.
  writeFileSync(DB + "-wal", "stale");
  writeFileSync(DB + "-shm", "stale");
  copyFileSync(BACKUP, paths.pendingRestorePath());

  assert.equal(paths.applyPendingRestore(), true);
  assert.equal(existsSync(DB + "-wal"), false, "🔴 الـ-wal القديم حُذف مع التبديل");
  assert.equal(existsSync(DB + "-shm"), false, "الـ-shm القديم حُذف كذلك");
  assert.deepEqual(patientNames(DB), ["مريض قبل النسخة"], "الملف المستعاد يُقرأ سليماً");
});
