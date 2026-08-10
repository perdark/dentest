# Dentest — project guide for Claude

LOCAL on-prem records + money system for an Iraqi dental clinic (replaces paper notebooks).
Runs on the clinic laptop at localhost. Arabic, **RTL**, Iraqi Dinar. Single shared PIN. No cloud.

- **Spec / source of truth:** `BRIEF.md` (decoded brief + clinic answers + two-layer strategy).
- **Build rules for any new screen:** `docs/CONVENTIONS.md` — read it before editing UI.
- **Locked money logic (D1–D8):** documented in `lib/settlement.ts` + `lib/mutations.ts` comments and the verification in `scripts/verify.ts`.

## Stack (overrides the global Supabase/Vercel default — this is LOCAL)
Next.js 16 (App Router, RSC, server actions) · TypeScript · Tailwind v4 · shadcn **Base UI** registry
(use `render={<C/>}`, NOT `asChild`) · SQLite + Drizzle + better-sqlite3 (one file `dentest.db`).

## Golden rules
1. **All DB writes go through `lib/mutations.ts` / `lib/settlement.ts`; reads through `lib/queries.ts`.** Never `db.insert/update/delete` from a page or action. The mutations layer owns audit logging, closed-period staleness (D4), and implant numbering.
2. **Money = integer Iraqi Dinars.** Parse input with `parseAmount()`, display with `formatIQD()`. Compute totals server-side; never trust a client total. No floats.
3. **Server actions** live in `lib/actions/<feature>.ts` (`"use server"`), zod-validate, call a mutation, then `revalidatePath`.
4. **Layer 2 numbers are UNCONFIRMED** (commission %, lab/% formula, 5M rule, salaries) — they live in Settings with "غير مؤكد" badges. Never hardcode them.

## Commands
- `npm run db:setup` — migrate + seed (run once; seeds 5 doctors, 7 treatments, placeholder prices, **default PIN 1234**).
- `npm run dev` — dev server. `npm run build && npm start` — production (what the clinic runs).
- `npm run db:generate` — new migration after a schema change, then `npm run db:migrate`.
- Backup: the **الإعدادات** page has a one-click button (writes `backups/dentest-<timestamp>.db`).
