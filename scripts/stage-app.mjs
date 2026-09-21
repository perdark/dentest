/**
 * Assemble exactly what ships to the clinic, into build/app/.
 *
 * `next build` with output:"standalone" copies more than it should — the source
 * recordings the brief was decoded from, the working zuha.db, docs, tests.
 * None of that belongs on the clinic's laptop, and the recordings alone are
 * 33 MB of patient-adjacent audio. So rather than delete afterwards (easy to
 * get wrong, and a miss means clinic data ships), this copies ONLY an explicit
 * allow-list. Anything not named here does not reach the client. [packaging]
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, ".next", "standalone");
const out = path.join(root, "build", "app");

/**
 * Settings arrive as `--flag=value`, not as a `VAR=value` shell prefix.
 *
 * npm hands every script to cmd.exe on Windows whatever shell you typed it in,
 * and `ZUHA_TARGET_PLATFORM=win32 npm run stage` is not an assignment there —
 * it is a command name. `npm run dist:win` died on that line for anyone not
 * inside Git Bash. Flags are read by node itself, so the same script now works
 * from cmd, PowerShell and bash alike. The old environment variables are still
 * honoured, one step below the flags, for anything that already exports them.
 * [packaging]
 */
const flags = Object.fromEntries(
  process.argv.slice(2).flatMap((arg) => {
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    return m ? [[m[1], m[2]]] : [];
  }),
);

// Target platform for the native module. Defaults to the host so the packaged
// app can be test-run locally; pass --platform=win32 for the clinic installer.
const targetPlatform =
  flags.platform || process.env.ZUHA_TARGET_PLATFORM || process.platform;
const targetArch = flags.arch || process.env.ZUHA_TARGET_ARCH || "x64";

function must(p, what) {
  if (!fs.existsSync(p)) {
    console.error(`✗ missing ${what}: ${p}\n  Run \`npm run build\` first.`);
    process.exit(1);
  }
}

must(path.join(standalone, "server.js"), "standalone server");
must(path.join(root, ".next", "static"), "static assets");

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// Symlinks must never survive into the bundle. Next aliases external packages
// with a RELATIVE symlink (.next/node_modules/better-sqlite3-<hash> ->
// ../../node_modules/better-sqlite3); copying that as a link re-points it at
// this build machine, so the app silently loads the build host's binary and
// breaks the moment it is installed anywhere else. Windows installers also
// handle symlinks poorly. dereference:true turns every link into a real file.
const copy = (from, to) =>
  fs.cpSync(from, to, { recursive: true, dereference: true });

// 1. The server itself, from the standalone build.
for (const entry of ["server.js", "package.json", ".next", "node_modules"]) {
  const from = path.join(standalone, entry);
  if (!fs.existsSync(from)) continue;
  copy(from, path.join(out, entry));
}

// 2. Static assets + public are NOT included in standalone by design.
copy(path.join(root, ".next", "static"), path.join(out, ".next", "static"));
copy(path.join(root, "public"), path.join(out, "public"));

// 3. Migrations — the app migrates itself on first launch.
copy(path.join(root, "drizzle"), path.join(out, "drizzle"));

// 3b. The DEMO bundle only: a pre-filled database to install on first launch.
//
//     The clean build passes nothing here and ships no database — it creates an
//     empty one on the clinic laptop. The demo build passes --seed-db so the
//     client can unzip, open, and immediately see a clinic with three months of
//     history in it. The Electron wrapper copies this into the user's data
//     folder once, and only when no database exists there yet. [packaging]
const seedDb = flags["seed-db"] || process.env.ZUHA_SEED_DB;
if (seedDb) {
  if (!fs.existsSync(seedDb)) {
    console.error(`✗ seed database was requested but is missing: ${seedDb}`);
    console.error("  Run `npm run db:demo:build` first.");
    process.exit(1);
  }
  // A sidecar means the file is not self-contained; make-demo-db.mjs
  // checkpoints and leaves WAL mode precisely so this cannot happen.
  for (const sidecar of ["-wal", "-shm"]) {
    if (fs.existsSync(seedDb + sidecar)) {
      console.error(`✗ seed database still has a ${sidecar} sidecar.`);
      console.error("  It would ship an incomplete database. Rebuild it.");
      process.exit(1);
    }
  }
  fs.mkdirSync(path.join(out, "seed"), { recursive: true });
  fs.copyFileSync(seedDb, path.join(out, "seed", "zuha.db"));
  console.log(
    `→ bundled demo database (${(fs.statSync(seedDb).size / 1024 / 1024).toFixed(1)} MB)`,
  );
}

// 4. Drop image-optimisation binaries: this app renders no <Image>, and
//    sharp + @img is ~33 MB of platform-specific native code.
for (const dead of ["@img", "sharp"]) {
  fs.rmSync(path.join(out, "node_modules", dead), { recursive: true, force: true });
}

// 5. Swap better-sqlite3's native binary for one built against ELECTRON's ABI.
//
//    The copy in node_modules was compiled for plain Node (NODE_MODULE_VERSION
//    115); Electron 3x needs 145, and loading the wrong one fails at startup
//    with ERR_DLOPEN_FAILED. We must NOT `npm rebuild` in place — the dev
//    server, the tests and scripts/verify.ts all run under plain Node and would
//    break. So the correct binary is fetched into the STAGED copy only, leaving
//    the development tree untouched. This is also how the Windows binary is
//    obtained from a Linux host: it is downloaded, not compiled. [packaging]
{
  const electronVersion = JSON.parse(
    fs.readFileSync(path.join(root, "node_modules", "electron", "package.json"), "utf8"),
  ).version;
  const moduleDir = path.join(out, "node_modules", "better-sqlite3");
  // The node_modules/.bin entry is an extensionless shell script. Windows
  // cannot exec it, so execFileSync fails with ENOENT and the whole stage
  // aborts. Run the package JS entry under the current Node binary instead —
  // identical behaviour on every platform. [packaging]
  const prebuildInstall = path.join(root, "node_modules", "prebuild-install", "bin.js");

  console.log(
    `→ fetching better-sqlite3 for electron ${electronVersion} ${targetPlatform}-${targetArch}`,
  );
  try {
    execFileSync(
      process.execPath,
      [
        prebuildInstall,
        "--runtime=electron",
        `--target=${electronVersion}`,
        `--platform=${targetPlatform}`,
        `--arch=${targetArch}`,
        "--tag-prefix=v",
        "--force",
      ],
      { cwd: moduleDir, stdio: "pipe" },
    );
  } catch (e) {
    console.error("✗ could not fetch the Electron build of better-sqlite3.");
    console.error(String(e.stderr || e.message));
    console.error(
      "  Without it the app cannot open the database on the target machine.",
    );
    process.exit(1);
  }

  const binary = path.join(moduleDir, "build", "Release", "better_sqlite3.node");
  if (!fs.existsSync(binary)) {
    console.error(`✗ native binary missing after fetch: ${binary}`);
    process.exit(1);
  }

  // Dereferencing produced independent copies of the module (the real one plus
  // Next's hashed alias). Every copy must carry the SAME target-platform
  // binary, or whichever one Node resolves first decides whether the app runs.
  const fresh = fs.readFileSync(binary);
  let synced = 0;
  (function sync(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) sync(p);
      else if (e.name === "better_sqlite3.node" && p !== binary) {
        fs.writeFileSync(p, fresh);
        synced++;
      }
    }
  })(out);
  if (synced) console.log(`→ synced ${synced} duplicate native binar${synced === 1 ? "y" : "ies"}`);
}

// 6. Provide the hashed aliases Turbopack emits for external packages.
//
//    The built server does `require("better-sqlite3-<hash>")`, but no such
//    package exists anywhere — not even in Next's own standalone output. When
//    that lookup fails the loader falls back to a path derived from the BUILD
//    machine, which is why this appeared to work here and would have failed on
//    the clinic's Windows laptop with "Cannot find module". Creating the alias
//    makes the documented require succeed outright, so resolution no longer
//    depends on where the app was built. [packaging]
{
  const chunks = path.join(out, ".next", "server", "chunks");
  const aliases = new Set();
  (function scan(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) scan(p);
      else if (e.name.endsWith(".js")) {
        const src = fs.readFileSync(p, "utf8");
        for (const m of src.matchAll(/require\("([a-z0-9@/._-]+)-([0-9a-f]{16})"\)/gi)) {
          aliases.add(`${m[1]}-${m[2]}`);
        }
      }
    }
  })(chunks);

  for (const alias of aliases) {
    const real = alias.replace(/-[0-9a-f]{16}$/i, "");
    const from = path.join(out, "node_modules", real);
    const to = path.join(out, "node_modules", alias);
    if (!fs.existsSync(from)) {
      console.error(`✗ external "${real}" is required as "${alias}" but is not bundled.`);
      process.exit(1);
    }
    fs.rmSync(to, { recursive: true, force: true });
    fs.cpSync(from, to, { recursive: true });
    // package.json "name" must match the folder or Node rejects the resolve.
    const pkgPath = path.join(to, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    pkg.name = alias;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    console.log(`→ aliased ${real} → ${alias}`);
  }
  if (aliases.size === 0) {
    console.warn("! no hashed externals found — verify the app still starts.");
  }
}

// 7. Rename node_modules -> vendor.
//
//    electron-builder unconditionally excludes any directory called
//    "node_modules" from the packaged output — via extraResources AND via
//    files, with or without an explicit filter. The dependencies therefore
//    never reached the installer and the app could not have started. Shipping
//    them under a neutral name gets them packaged; the Electron wrapper then
//    points NODE_PATH at this folder so require() still finds them. [packaging]
{
  const from = path.join(out, "node_modules");
  const to = path.join(out, "vendor");
  fs.rmSync(to, { recursive: true, force: true });
  fs.renameSync(from, to);
  // .next/node_modules only held Next's symlinked alias, now a real package in
  // vendor/. Left in place it would be dropped by the same exclusion anyway.
  fs.rmSync(path.join(out, ".next", "node_modules"), { recursive: true, force: true });
  console.log("→ node_modules → vendor (electron-builder excludes node_modules)");
}

// 8. Safety net — assert no clinic data or source media slipped through.
const forbidden = [];
(function scan(dir, depth = 0) {
  if (depth > 3) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (["transcripts", "transcripts_v2", "frames", "docs", "tests", "backups"].includes(e.name)) {
        forbidden.push(path.relative(out, p));
      } else scan(p, depth + 1);
    } else if (/\.(db|db-wal|db-shm|MOV|m4a|jpg|jpeg)$/i.test(e.name)) {
      // The demo bundle's seed database is the ONE database allowed through,
      // and only at this exact path. Everything else matching is clinic data or
      // source media that must never reach a client. [packaging]
      const rel = path.relative(out, p);
      if (!(seedDb && rel === path.join("seed", "zuha.db"))) forbidden.push(rel);
    }
  }
})(out);

if (forbidden.length) {
  console.error("✗ refusing to ship — clinic data or source media in the bundle:");
  for (const f of forbidden) console.error("   " + f);
  process.exit(1);
}

function sizeOf(p) {
  let total = 0;
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const q = path.join(p, e.name);
    total += e.isDirectory() ? sizeOf(q) : fs.statSync(q).size;
  }
  return total;
}

console.log(`✅ staged build/app — ${(sizeOf(out) / 1024 / 1024).toFixed(1)} MB`);
console.log(
  seedDb
    ? "   demo database bundled; no recordings, no docs."
    : "   no database, no recordings, no docs.",
);
