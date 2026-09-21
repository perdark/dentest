/**
 * Build the pre-filled database that ships inside the DEMO bundle.
 *
 * The clinic laptop has no terminal, so `npm run db:demo` can never be run
 * there. A demo copy the client can simply unzip and open therefore has to
 * carry its records with it: this produces that file, and `stage-app.mjs`
 * copies it into the bundle as `seed/zuha.db`, from where the Electron wrapper
 * installs it on first launch. [packaging]
 *
 * Never used by the clean build — that one ships no database at all and seeds
 * itself empty on first start.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = process.env.ZUHA_DEMO_DB || path.join(root, "build", "demo", "zuha.db");

fs.mkdirSync(path.dirname(out), { recursive: true });
// A half-built demo from an earlier run would fail `isDatabaseEmpty` and abort.
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(out + suffix, { force: true });

const run = (entry, args, extraEnv = {}) =>
  // Always through process.execPath: the node_modules/.bin entries are
  // extensionless shell scripts that Windows cannot exec, so calling them
  // directly fails with ENOENT. [packaging]
  execFileSync(process.execPath, [entry, ...args], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ZUHA_DB: out, ...extraEnv },
  });

const bin = (pkg, entry) => path.join(root, "node_modules", pkg, entry);

console.log("→ migrating demo database");
run(bin("drizzle-kit", "bin.cjs"), ["migrate"]);

console.log("→ seeding doctors, treatments, settings, PIN");
run(bin("tsx", "dist/cli.mjs"), ["lib/db/seed.ts"]);

console.log("→ filling three months of fictional clinic life");
// The demo generator writes through the mutations layer, which is server-only.
run(bin("tsx", "dist/cli.mjs"), ["scripts/demo.ts"], { NODE_OPTIONS: "--conditions=react-server" });

/*
 * Fold the write-ahead log back into the main file and leave WAL mode behind.
 *
 * Everything above ran in WAL mode, so the newest rows live in `zuha.db-wal`,
 * not in `zuha.db`. Copying only the main file into the bundle would ship a
 * database missing most of the demo — and shipping the sidecar instead is
 * worse, because SQLite would replay a log belonging to a different machine's
 * session. Checkpoint, then switch the journal to DELETE so the file that
 * lands in the bundle is genuinely self-contained.
 */
const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
{
  const sealed = new Database(out);
  sealed.pragma("wal_checkpoint(TRUNCATE)");
  sealed.pragma("journal_mode = DELETE");
  const patients = sealed.prepare("SELECT COUNT(*) AS n FROM patients").get().n;
  sealed.close();
  if (patients === 0) {
    console.error("✗ demo database has no patients — the fill did not take.");
    process.exit(1);
  }
  console.log(`→ sealed ${patients} demo patients into a single file`);
}

for (const suffix of ["-wal", "-shm"]) {
  const sidecar = out + suffix;
  if (fs.existsSync(sidecar)) fs.rmSync(sidecar);
}

console.log(`✅ demo database ready — ${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB`);
console.log(`   ${out}`);
