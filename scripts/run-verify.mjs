/**
 * Run the D1–D9 verification against a throwaway database.
 *
 * This replaces the shell one-liner that used to be `verify` in package.json.
 * That line opened with `rm -f` and set `ZUHA_DB=` inline — neither of which
 * cmd.exe understands, and npm hands every script to cmd.exe on Windows. Same
 * fix, and same shape, as `scripts/e2e-server.mjs`.
 *
 * The ordering is the point, and it is unconditional: reset, migrate, seed,
 * verify. A database left behind by a previous run would be seeded twice, so
 * the checks would start against duplicated doctors and treatment types.
 *
 * ZUHA_DB is redirected the whole way through, so a verification run can never
 * touch the clinic's zuha.db. [isolation]
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = path.join(root, "verify.db");

for (const suffix of ["", "-shm", "-wal"]) {
  fs.rmSync(dbPath + suffix, { force: true });
}

const env = { ...process.env, ZUHA_DB: dbPath };

// Always through process.execPath: the node_modules/.bin entries are
// extensionless shell scripts that Windows cannot exec. [packaging]
const bin = (pkg, entry) => path.join(root, "node_modules", pkg, entry);
const run = (entry, args, extraEnv) =>
  execFileSync(process.execPath, [entry, ...args], {
    cwd: root,
    stdio: "inherit",
    env: { ...env, ...extraEnv },
  });

try {
  console.log("→ migrating verify database");
  run(bin("drizzle-kit", "bin.cjs"), ["migrate"]);

  console.log("→ seeding verify database");
  run(bin("tsx", "dist/cli.mjs"), ["lib/db/seed.ts"]);

  // scripts/verify.ts reads the real data layer, which is server-only code —
  // see scripts/run-tsx.mjs for why the condition has to be set.
  run(bin("tsx", "dist/cli.mjs"), ["scripts/verify.ts"], {
    NODE_OPTIONS: [process.env.NODE_OPTIONS, "--conditions=react-server"]
      .filter(Boolean)
      .join(" "),
  });
} catch (err) {
  // A failed check is a normal outcome; report its exit code and no stack.
  process.exit(typeof err.status === "number" ? err.status : 1);
}
