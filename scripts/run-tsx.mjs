/**
 * Run tsx with the `react-server` export condition, from any shell.
 *
 * The scripts this replaces were written as
 * `NODE_OPTIONS=--conditions=react-server tsx …`. npm hands every script to
 * cmd.exe on Windows regardless of the shell you typed it in, and cmd.exe reads
 * that prefix as a command name, not an assignment — so `npm test` and
 * `npm run db:demo` died on their first line on the platform the clinic uses.
 * Same fix, and same reasoning, as `scripts/e2e-server.mjs`.
 *
 * The condition itself is not optional: `lib/queries.ts` and friends are
 * server-only modules, and without it they resolve to the client build and the
 * tests fail on imports rather than on anything they meant to assert.
 *
 * Usage: node scripts/run-tsx.mjs [--test] <file…>
 */
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Appended, never assigned: NODE_OPTIONS may already carry something the person
// running this put there, and dropping it silently would be its own bug.
const nodeOptions = [process.env.NODE_OPTIONS, "--conditions=react-server"]
  .filter(Boolean)
  .join(" ");

// Always through process.execPath: the node_modules/.bin entries are
// extensionless shell scripts that Windows cannot exec. [packaging]
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");

try {
  execFileSync(process.execPath, [tsx, ...process.argv.slice(2)], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NODE_OPTIONS: nodeOptions },
  });
} catch (err) {
  // A failing test is a normal outcome here; report its exit code and no stack.
  process.exit(typeof err.status === "number" ? err.status : 1);
}
