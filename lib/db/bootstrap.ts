import fs from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, sqlite } from "./client";
import { backupsDir, dataDir } from "../paths";
import { seed } from "./seed";

/**
 * Bring the database up to date on server start.
 *
 * The packaged clinic app has no terminal, so `npm run db:setup` can never be
 * run there — a fresh install must migrate and seed itself on first launch.
 * Both steps are idempotent, so this is safe to run on every start.
 */

function migrationsFolder(): string {
  // Packaged: Electron points this at the bundled copy. Dev: ./drizzle.
  const configured = process.env.ZUHA_MIGRATIONS_DIR;
  if (configured && fs.existsSync(configured)) return configured;
  return path.join(process.cwd(), "drizzle");
}

let done = false;

export function ensureDatabase(): void {
  if (done) return;
  done = true;

  const folder = migrationsFolder();
  if (!fs.existsSync(folder)) {
    throw new Error(
      `Migrations folder not found at ${folder} — the install is incomplete.`,
    );
  }

  snapshotOnVersionChange();
  migrate(db, { migrationsFolder: folder });
  seed();
}

/**
 * Take a restorable copy of the records the first time a new version starts,
 * BEFORE its migrations run.
 *
 * Updates now install themselves silently (electron/updater.js), so nobody is
 * standing at the laptop to take a backup first. If a release ships a bad
 * migration, this copy — named like every other backup, so «استعادة نسخة
 * محفوظة» lists it — is the way back. Only the packaged app sets
 * ZUHA_APP_VERSION; dev, tests and verify skip this entirely.
 */
function snapshotOnVersionChange(): void {
  const version = process.env.ZUHA_APP_VERSION;
  if (!version) return;
  const marker = path.join(dataDir(), "last-version.txt");
  const previous = fs.existsSync(marker) ? fs.readFileSync(marker, "utf8").trim() : "";
  if (previous === version) return;

  try {
    const { n } = sqlite
      .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'")
      .get() as { n: number };
    if (n > 0) {
      const dir = backupsDir();
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      sqlite.prepare("VACUUM INTO ?").run(path.join(dir, `zuha-${stamp}.db`));
    }
    fs.writeFileSync(marker, version);
  } catch (e) {
    // A failed snapshot must not stop the clinic from working; it is retried
    // on the next start because the marker was not written.
    console.error("pre-update snapshot failed:", e);
  }
}
