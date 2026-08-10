import path from "node:path";

/**
 * Where the clinic's DATA lives — deliberately separate from where the app's
 * CODE lives.
 *
 * In the packaged Windows app the program sits in Program Files, which is
 * read-only for a normal user and is replaced wholesale on every update. A
 * database written next to the executable would therefore either fail to open
 * or be destroyed by the next install. The Electron main process sets
 * DENTEST_DATA_DIR to the per-user app-data folder instead, so the records
 * outlive the program.
 *
 * In development nothing is set, so everything stays in the project folder
 * exactly as before.
 */
export function dataDir(): string {
  return process.env.DENTEST_DATA_DIR || process.cwd();
}

/** Full path to the SQLite file. DENTEST_DB overrides (tests, verify script). */
export function databasePath(): string {
  return process.env.DENTEST_DB || path.join(dataDir(), "dentest.db");
}

/** Folder for one-click backups. Lives beside the database, never in the bundle. */
export function backupsDir(): string {
  return process.env.DENTEST_BACKUPS_DIR || path.join(dataDir(), "backups");
}
