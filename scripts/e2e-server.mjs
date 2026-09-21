/**
 * Start the server the Playwright suite runs against.
 *
 * This replaces the shell one-liner that used to be `e2e:server` in
 * package.json. That line used `rm -f` and inline `VAR=value` prefixes, which
 * npm hands to cmd.exe on Windows and cmd.exe cannot parse — so `npm run e2e`
 * aborted before a single test ran on the platform the clinic actually uses.
 * Doing the same work in Node behaves identically on every platform.
 *
 * The ordering is deliberately part of starting the server rather than a test
 * hook: reset, migrate, seed, then serve, unconditionally and in that order.
 *
 * Isolation is the point. ZUHA_DB, ZUHA_BACKUPS_DIR and ZUHA_DIST_DIR are all
 * redirected, so the suite can never touch the clinic's zuha.db, never write
 * into backups/, and never fight a normal dev server for the .next build lock.
 * [e2e isolation]
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = path.join(root, "e2e.db");

// A database left behind by a previous run would be seeded a second time, so
// the suite would start against duplicated doctors and treatment types.
for (const suffix of ["", "-shm", "-wal"]) {
  fs.rmSync(dbPath + suffix, { force: true });
}

const env = { ...process.env, ZUHA_DB: dbPath };

// Always through process.execPath: the node_modules/.bin entries are
// extensionless shell scripts that Windows cannot exec. [packaging]
const bin = (pkg, entry) => path.join(root, "node_modules", pkg, entry);
const run = (entry, args) =>
  execFileSync(process.execPath, [entry, ...args], {
    cwd: root,
    stdio: "inherit",
    env,
  });

console.log("→ migrating e2e database");
run(bin("drizzle-kit", "bin.cjs"), ["migrate"]);

console.log("→ seeding e2e database");
run(bin("tsx", "dist/cli.mjs"), ["lib/db/seed.ts"]);

console.log("→ starting next dev on port 3100");
const child = spawn(
  process.execPath,
  [bin("next", "dist/bin/next"), "dev", "-p", "3100"],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...env,
      ZUHA_BACKUPS_DIR: path.join(root, "e2e-backups"),
      ZUHA_DIST_DIR: ".next-e2e",
    },
  },
);

// Playwright kills this process between runs; pass the signal on so no orphan
// next-dev keeps port 3100 and makes the next run fail with EADDRINUSE.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
child.on("exit", (code) => process.exit(code ?? 0));
