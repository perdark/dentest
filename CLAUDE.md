# Zuha — project guide for Claude

LOCAL on-prem records + money system for an Iraqi dental clinic (replaces paper notebooks).
Runs on the clinic laptop at localhost. Arabic, **RTL**, Iraqi Dinar. Single shared PIN. No cloud.

- **Spec / source of truth:** `BRIEF.md` (decoded brief + clinic answers + two-layer strategy).
- **Build rules for any new screen:** `docs/CONVENTIONS.md` — read it before editing UI.
- **Locked money logic (D1–D9):** documented in `lib/settlement.ts` + `lib/mutations.ts` comments and the verification in `scripts/verify.ts`. (D9 = X-ray income is the clinic's, never a doctor's — see `docs/OWNER-NOTES.md` §5.)

## Stack (overrides the global Supabase/Vercel default — this is LOCAL)
Next.js 16 (App Router, RSC, server actions) · TypeScript · Tailwind v4 · shadcn **Base UI** registry
(use `render={<C/>}`, NOT `asChild`) · SQLite + Drizzle + better-sqlite3 (one file `zuha.db`).

## Golden rules
1. **All DB writes go through `lib/mutations.ts` / `lib/settlement.ts`; reads through `lib/queries.ts`.** Never `db.insert/update/delete` from a page or action. The mutations layer owns audit logging, closed-period staleness (D4), and implant numbering.
2. **Money = integer Iraqi Dinars.** Parse input with `parseAmount()`, display with `formatIQD()`. Compute totals server-side; never trust a client total. No floats.
3. **Server actions** live in `lib/actions/<feature>.ts` (`"use server"`), zod-validate, call a mutation, then `revalidatePath`.
4. **Lab money (`lab_entries`) is TRACK-ONLY** — never in a payout, never in clinic cash, and a
   late entry against a closed month must NOT mark it stale (the only `recordEdit({markStale:false})`
   caller). It is a different number from `cases.labCost`; confusing the two silently deducts money
   from doctors' shares. See `docs/OWNER-NOTES.md` §9 + `tests/lab-dues.test.ts`.
5. **Layer 2 numbers are UNCONFIRMED** (commission %, lab/% formula, 5M rule, salaries) — they live in Settings, editable, never hardcoded in a screen. They no longer carry "غير مؤكد" badges: build-phase caveats are not clinic-facing copy. What is unconfirmed is recorded in `docs/OWNER-NOTES.md` instead.
6. **A record's date is checked with `isRecordableDate()`, never `isValidISODate()` alone.**
   The latter only asks whether the day exists on a calendar, so «2099-12-31» passed everywhere
   until 2026-09-22: the money then left «تحصيل الشهر» and the settlement while still counting in
   «النقد المتوفر» and against the patient's balance, and nothing said why the two stopped
   agreeing. Every date input that defaults to `today` also carries `min={EARLIEST_RECORD_DATE}`
   and `max={today}`. **Appointments are the exception** — a booking is in the future by
   definition, so `lib/actions/appointments.ts` and the `nextAppointment` fields in
   `lib/actions/ortho.ts` stay on `isValidISODate`.
7. **Nothing in the UI tells the clinic it is looking at a test system.** No demo banner, no "غير مؤكد", no placeholder or TODO text. Demo data is loaded by `npm run db:demo` before handover, never from inside the app.

## Commands
- `npm run db:setup` — migrate + seed (run once; seeds 4 doctors, 11 treatment types, **default PIN 1234**). No prices are seeded — «قائمة الأسعار» was removed 2026-08-19 and every case is priced when it is opened. Doctors are seeded without a lab name; each is set from «الأطباء ← اسم الطبيب».
- `npm run dev` — dev server. `npm run build && npm start` — a production build in a browser,
  for checking a screen by hand. It is **not** what the clinic runs, and `next start` prints
  `⚠ "next start" does not work with "output: standalone"` because of it — the warning is
  accurate and harmless here. The clinic runs `electron/main.js`, which spawns
  `.next/standalone/server.js` on a random port with `ZUHA_DATA_DIR` pointed at
  `%APPDATA%\zuha`. To exercise what it actually ships, build the package and launch
  `dist/win-unpacked/Zuha.exe`; `--user-data-dir=<scratch>` sends it at a throwaway database
  instead of the clinic's.
- `npm run db:generate` — new migration after a schema change, then `npm run db:migrate`.
- **No shell syntax in `package.json` scripts.** npm runs every script through cmd.exe on Windows
  whatever shell you typed it in, so `VAR=value cmd`, `rm -f`, quoted globs and `$(…)` all break on
  the machine this is built on. Anything needing environment variables or file cleanup goes in a
  small `scripts/*.mjs` runner instead (`run-tsx.mjs`, `run-verify.mjs`, `e2e-server.mjs`,
  `stage-app.mjs` — the last takes `--platform=`/`--arch=`/`--seed-db=` flags). Plain `cmd && cmd`
  chains are fine.
- Backup: the **الإعدادات** page has a one-click button (writes `backups/zuha-<timestamp>.db`).
- Restore: same page, «استعادة نسخة محفوظة». It **stages** the file and the swap happens on the
  next start (`applyPendingRestore()` in `lib/paths.ts`, called before the connection opens) —
  the DB cannot be replaced under a live better-sqlite3 handle. A safety copy of the current
  records is taken first, so a wrong choice is undoable. See `tests/backup-restore.test.ts`.

## Testing — three layers, do not duplicate between them
- `npm test` — money arithmetic in isolation (settlement, payments, audit, x-ray income,
  ortho open-total, lab dues).
- `npm run verify` — D1–D9 end-to-end against the real data layer on a throwaway `verify.db`.
- `npm run e2e` — **browser** tests (Playwright, `e2e/`): PIN gate, all 16 screens render in RTL
  without console errors, and form → server action → mutations → settlement wiring. ~1 min.
  Runs its own `next dev` on **port 3100** with `ZUHA_DB=./e2e.db` + `ZUHA_BACKUPS_DIR=./e2e-backups`,
  so it can never touch clinic data. `npm run e2e:report` for the HTML report after a failure.
  - Selectors are the existing `data-tour="…"` attributes — reuse them, don't add CSS selectors.
  - Arithmetic belongs in the two layers above; `e2e/` only proves the screens are *connected*.
  - The daily entry dialog treatment field is **free text** with saved suggestions (2026-08-19);
    `findOrCreateTreatmentType` refuses any name matching a non-normal bucket — implants, ortho
    and x-rays are opened from their own screens (D9). A test that types «زراعة» there will fail
    correctly.
  - `npm rebuild better-sqlite3` after any Node upgrade, or every DB-touching script dies with
    `ERR_DLOPEN_FAILED` (native module built for the previous ABI).
