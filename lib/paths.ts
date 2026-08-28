import fs from "node:fs";
import path from "node:path";

/**
 * Where the clinic's DATA lives — deliberately separate from where the app's
 * CODE lives.
 *
 * In the packaged Windows app the program sits in Program Files, which is
 * read-only for a normal user and is replaced wholesale on every update. A
 * database written next to the executable would therefore either fail to open
 * or be destroyed by the next install. The Electron main process sets
 * ZUHA_DATA_DIR to the per-user app-data folder instead, so the records
 * outlive the program.
 *
 * In development nothing is set, so everything stays in the project folder
 * exactly as before.
 */
export function dataDir(): string {
  return process.env.ZUHA_DATA_DIR || process.cwd();
}

/** Full path to the SQLite file. ZUHA_DB overrides (tests, verify script). */
export function databasePath(): string {
  return process.env.ZUHA_DB || path.join(dataDir(), "zuha.db");
}

/** Folder for one-click backups. Lives beside the database, never in the bundle. */
export function backupsDir(): string {
  return process.env.ZUHA_BACKUPS_DIR || path.join(dataDir(), "backups");
}

/**
 * The app was called «دِنتِست» (Dentest) before it was renamed to «زُهى», and it
 * wrote its records to `dentest.db`. A clinic that already entered real patients
 * must not be silently handed an empty database by a rename, so the old file is
 * adopted under the new name the first time the new build starts.
 *
 * Copy, never move: if anything about the new name goes wrong, the original is
 * still sitting there untouched to fall back to. The `-wal` sidecar is copied
 * too because in WAL mode the newest committed rows may live only there; `-shm`
 * is deliberately skipped, as SQLite rebuilds that index on open.
 *
 * Must run BEFORE the database connection is opened — better-sqlite3 creates an
 * empty file on connect, after which "the new file does not exist yet" is false
 * forever and the real records would be stranded.
 */
export function adoptLegacyDatabase(): void {
  // An explicit override means a caller chose the exact file (tests, verify).
  if (process.env.ZUHA_DB) return;

  const target = databasePath();
  if (fs.existsSync(target)) return;

  const legacy = path.join(dataDir(), "dentest.db");
  if (!fs.existsSync(legacy)) return;

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(legacy, target);
  if (fs.existsSync(legacy + "-wal")) fs.copyFileSync(legacy + "-wal", target + "-wal");
}

/**
 * Where a restore waits between being chosen and being applied.
 *
 * ⚠️ A restore cannot happen while the app is running: `better-sqlite3` holds
 * the database open, and replacing the file under a live connection gives you a
 * process reading a file that no longer exists. So «استعادة» does not restore —
 * it STAGES, writing the chosen backup here, and the swap happens on the next
 * start before anything opens a connection. Same reasoning, and same timing, as
 * `adoptLegacyDatabase` above.
 *
 * Sits beside the database rather than in a fixed folder so ZUHA_DB (tests,
 * verify, e2e) carries the pending file with it and never touches clinic data.
 */
export function pendingRestorePath(): string {
  return databasePath() + ".pending";
}

/**
 * Swap in a staged restore. Returns true when one was applied.
 *
 * Must run BEFORE the database connection is opened, for the same reason as
 * `adoptLegacyDatabase`.
 *
 * 🔴 The WAL sidecars are deleted FIRST, and that order is the whole point. A
 * `-wal` file belongs to the database being replaced; left beside the restored
 * file, SQLite would replay it on open and silently write the very rows the
 * clinic restored in order to be rid of. Deleting them before the swap means a
 * crash mid-way leaves the OLD database in place — which is why
 * `restoreBackup` takes a safety copy of it before staging anything.
 */
export function applyPendingRestore(): boolean {
  const pending = pendingRestorePath();
  if (!fs.existsSync(pending)) return false;

  const target = databasePath();
  for (const sidecar of ["-wal", "-shm"]) {
    if (fs.existsSync(target + sidecar)) fs.rmSync(target + sidecar);
  }
  // Replaces the destination on both POSIX and Windows.
  fs.renameSync(pending, target);
  return true;
}
