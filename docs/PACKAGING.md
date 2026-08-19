# Packaging — the Windows desktop app

The clinic gets one icon to double-click. Behind it, the Electron wrapper starts the Next.js
standalone server on `127.0.0.1` using **Electron's own bundled Node**, so the laptop needs no
Node install and nothing is exposed to the network.

## Build

```bash
npm run dist:win     # → dist/Zuha-<version>-win-x64.zip
npm run dist:linux   # → dist/linux-unpacked  (for testing on this machine)
npm run app:start    # run the packaged bundle locally without installing
```

`dist:win` = `next build` → `scripts/stage-app.mjs` → `electron-builder`.

## Where the clinic's data lives

**Not** beside the executable. Program Files is read-only for a normal user and is replaced
wholesale on update, so a database written there would either fail to open or be destroyed by
the next install. `electron/main.js` sets `ZUHA_DATA_DIR` to the per-user app-data folder:

| OS | Path |
|---|---|
| Windows | `C:\Users\<user>\AppData\Roaming\zuha` |
| Linux | `~/.config/zuha` |

`lib/paths.ts` is the single place that resolves this. In development nothing is set, so
everything stays in the project folder exactly as before.

There is no `npm run db:setup` on the clinic laptop, so `instrumentation.ts` runs the
migrations and the seed on **first server start**. Both are idempotent.

## Four traps this hit — all found by actually running the packaged app

Each of these produced a bundle that worked on the build machine and would have failed on the
clinic's. They are the reason `stage-app.mjs` exists instead of a plain copy.

1. **Next's alias is a relative symlink.** Next aliases external packages as
   `.next/node_modules/better-sqlite3-<hash> → ../../node_modules/better-sqlite3`. Copying it
   as a link re-pointed it at *this* machine, so the app silently loaded the build host's
   binary; with that folder hidden it failed with `Cannot find module`. → copy with
   `dereference: true`, and no symlinks are allowed in the bundle.

2. **The native module has the wrong ABI.** `better-sqlite3` from npm is built for plain Node
   (`NODE_MODULE_VERSION 115`); Electron needs its own (145), and Windows needs a `.dll`.
   Rebuilding in place would break the dev server, the tests and `scripts/verify.ts`, which all
   run under plain Node. → the correct binary is **downloaded into the staged copy only**
   (`prebuild-install --runtime=electron --platform=win32`), leaving the dev tree untouched.
   Dereferencing creates several copies of the module, so all of them are synced to the same
   binary — otherwise whichever one Node resolves first decides whether the app runs.

3. **electron-builder deletes `node_modules`.** Any folder with that name is stripped from the
   package — through `extraResources`, through `files`, with or without an explicit filter. The
   dependencies never reached the installer. → staged as `vendor/`, and the wrapper points
   `NODE_PATH` at it.

4. **`npmRebuild` contaminates the dev tree.** electron-builder rebuilt `better-sqlite3` for
   Windows *inside `node_modules/`*, after which `next build` died with `invalid ELF header`.
   → `npmRebuild: false`; staging owns the native binary.

`stage-app.mjs` also refuses to produce a bundle containing a `.db` file, the source
recordings, docs or tests — shipping the clinic's own data back to them is a failure mode worth
a hard stop, not a code review.

## What is verified, and what is not

**Verified by running it** (Linux, with `.next/standalone` hidden so nothing could fall back to
build-machine paths): window opens with the Arabic title and menu, login screen renders RTL in
Cairo, the database is created and migrated in the user-data folder, zero module errors.

**Verified structurally for Windows:** `Zuha.exe` and both copies of `better_sqlite3.node`
are `PE32+ x86-64`; the archive contains all 1785 entries with zero files missing versus the
staged bundle.

> ⚠️ **Not verified: the Windows binary has never been executed.** This machine is Linux Mint
> and has no Windows and no wine. The Windows-specific risks that remain are process spawning,
> path handling and SmartScreen — not the app logic, which is identical to what was verified.

**No installer.** NSIS requires wine, which needs root to install. The deliverable is a ZIP:
extract anywhere and run `Zuha.exe`. To produce a real installer later, run
`npm run dist:win` on a Windows machine after setting the target back to `nsis` in
`package.json` → `build.win.target`.

**Unsigned.** Windows SmartScreen will warn on first run ("More info" → "Run anyway"). Code
signing needs a paid certificate.

## First-launch checklist for the clinic laptop

1. Extract the ZIP, run `Zuha.exe`, dismiss SmartScreen.
2. The login screen appears within a few seconds → the server and native module loaded.
3. Log in with `1234`, then change the PIN in الإعدادات.
4. Help menu → «أين تُحفظ بيانات العيادة؟» → confirm the folder opens and contains `zuha.db`.
5. Enter the real price list and the confirmed doctor percentages.
6. Copy the data folder to a USB stick and confirm it opens — before the clinic relies on it.
