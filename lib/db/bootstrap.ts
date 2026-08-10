import fs from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./client";
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
  const configured = process.env.DENTEST_MIGRATIONS_DIR;
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

  migrate(db, { migrationsFolder: folder });
  seed();
}
