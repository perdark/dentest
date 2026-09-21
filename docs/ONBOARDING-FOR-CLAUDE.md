# Zuha — orientation for a Claude session

For an AI agent picking this repo up cold. `README.md` is for the clinic (Arabic, how to run
and back up the system); `CLAUDE.md` is the rule list you must obey. This file is the map
between them: what the system is, what will bite you, and how to make a change that fits.

Read this once, then work from `CLAUDE.md`.

---

## 1. Sixty-second orientation

A dental clinic in Iraq kept its records in spiral notebooks — a daily register, a debts
list on sticky notes, implant cards in a cabinet, and two parallel "accounts" ledgers (a
scratch copy and a clean official one). This app replaces all of it.

**It runs on one laptop, in the clinic, with no internet.** Next.js serves on
`127.0.0.1`, SQLite is a single file, login is one shared 4-digit PIN. Arabic, RTL, Iraqi
Dinar. It is also packaged as a Windows Electron app, which is how the clinic actually runs
it — there is no terminal on that machine.

Two facts shape almost every decision in the codebase:

**It handles other people's money.** Doctors are paid a commission on what their patients
actually pay. If a number is wrong, someone is underpaid or the clinic loses money, and
nobody finds out for a month. This is why writes funnel through one layer, why money is
integer dinars, and why there are three test layers.

**Some of the rules are still unconfirmed.** The clinic could not answer four questions
during the build: each doctor's commission %, whether the % applies before or after the lab
deduction, what the "cash over 5 million" rule does, and how salaries are computed. These
live in Settings as editable values and are **never** hardcoded. `docs/OWNER-NOTES.md` is
the running record of what is still open.

---

## 2. Read in this order

| File | Why |
|---|---|
| `CLAUDE.md` | The rules. Non-negotiable. |
| `docs/CONVENTIONS.md` | How to build a screen: patterns, Base UI API, Arabic copy rules. |
| `BRIEF.md` | The domain. What each paper register was and what replaced it. The 2026-08-19 addendum at the bottom **overrides** the sections above it. |
| `docs/OWNER-NOTES.md` | 16 numbered clinic decisions with reasons. Read the section before touching the feature it covers. |
| `lib/db/schema.ts` | Source of truth for columns. |
| `lib/settlement-math.ts` | 55 lines, the whole payout formula. Read it in full. |
| `docs/PROJECT-REVIEW-2026-09-21.md` | Current state, open findings, what to do next. |

`docs/OWNER-NOTES.md` is in Arabic and is the highest-value document in the repo. If you are
about to change money behaviour and you have not read the relevant section, stop and read it.

---

## 3. Architecture

```
app/(app)/<screen>/page.tsx     Server Component. Reads via lib/queries.ts. Renders a <form>.
  └── lib/actions/<feature>.ts  "use server". requireAuth() → zod → mutation → revalidatePath.
        └── lib/mutations.ts    THE ONLY WRITE PATH. Owns audit log, staleness, numbering.
              └── lib/db/       Drizzle + better-sqlite3, one file: zuha.db
```

- `lib/queries.ts` — all 44 reads.
- `lib/mutations.ts` — all 30 writes. Every one wrapped in `atomicMutation` (a transaction).
- `lib/settlement.ts` — monthly settlement, close/reopen, snapshotting.
- `lib/settlement-math.ts` — the pure payout formula. Shared by browser preview *and* server
  snapshot so the two can never disagree.
- `lib/server-utils.ts` — `getSettings`, `cashOnHand`, `recordEdit`, `nextCounter`.
- `lib/auth.ts` + `lib/crypto.ts` + `lib/rate-limit.ts` — PIN, session, brute-force lockout.
- `lib/strings.ts` — Arabic label maps and `NAV_ITEMS`. New screen → add it here.
- `lib/dates.ts` / `lib/format.ts` — every date and every amount on screen goes through these.
- `electron/main.js` — the desktop wrapper. Boots the Next server, owns the data folder.
- `scripts/` — `verify.ts` (D1–D9 harness), `demo.ts` (fills a fake clinic),
  `stage-app.mjs` + `make-demo-db.mjs` (packaging), `reset-pin.ts`.

16 tables. The ones that carry the money: `cases` (one treatment at an agreed price),
`payments` (signed dinars, one collection per row), `cashMovements` (non-payment cash),
`expenses`, `monthlySettlements` (the frozen snapshot), `labEntries` (tracking only — see
§5.2), `auditLog`.

**Authorization lives in the server actions, not in the proxy.** `proxy.ts` only checks that
a cookie exists, to make navigation feel right. The real cryptographic check is
`requireAuth()` at the top of every action. All 44 actions have it. Keep it that way.

---

## 4. The decision tags — `[D1]`–`[D9]`, `[A1]`–`[A7]`

Money code is annotated with these, and they are load-bearing: `[D9]` is why X-rays are
excluded from payouts by construction, `[D4]` is why editing a closed month marks it stale.

> **This table is reconstructed from the call sites**, because no file in the repo defines
> them (see review §6.4). Treat it as a reading aid, not as authority. Confirm against
> `docs/OWNER-NOTES.md` and the code before relying on one for a money change.

| Tag | Rule |
|---|---|
| **D1** | Settlement is **collection-based**. `collected` = net cash received in the period. `accrued` ("work-done") = cases *opened* in the period at their agreed price. Commission is paid on collected, not accrued. |
| **D2** | The credited doctor lives on the **payment**, not only the case. Defaults to the case's doctor but may differ — mid-treatment switch, or the owner runs one session. |
| **D3** | Commission % resolves as: per-month override → `doctor.commissionPct` → `settings.defaultCommissionPct`. Frozen into the snapshot at close. |
| **D4** | Editing anything inside a **closed** month marks that settlement `stale` and flags the audit row `hitClosedPeriod`. One escape hatch: `recordEdit({markStale:false})`, used *only* by lab entries. |
| **D5** | Payments are **signed** dinars; a refund is a negative row. (D5 originally *excluded* refunds from the base — superseded by A2.) |
| **D6** | Lab cost is a **clinic expense**, not deducted per doctor, unless `labDeductedPerDoctor` is on. |
| **D7** | The owner (Dr. Adi) is settled like any other doctor. `clinicNet` is reported separately. Salaries are 0 pending Layer 2. |
| **D8** | Cash on hand = payments + non-payment cash movements (reserves, withdrawals, payouts, owner draws). X-ray cash is included. |
| **D9** | **X-ray income is the clinic's, never a doctor's.** Never in a commissionable base, work-done total, or payout. Added whole into `clinicNet`. The doctor on a film is for follow-up only. |
| **A1** | Voiding a payment line is the **only** way to fix a mis-entry. A refund is a real financial event that nets against the doctor's base — never use it to undo a typo. |
| **A2** | Refunds **net out** and reduce the commissionable base: commission is never paid on refunded money. |
| **A3** | Totals are always derived server-side from price − discount. The client shows a preview only. |
| **A4** | `completed` means the dental work is done, **not** that the account is settled. A completed case with a balance still accepts money; only `cancelled` refuses. |
| **A5** | A blank commission % means "not set" and falls back. It must **never** read as 0%. |
| **A6** | A negative payout is clamped to 0 — otherwise the clinic appears to profit from a doctor's shortfall. The uncovered amount is reported separately as `shortfall`. |
| **A7** | A doctor's `collectedTotal` equals net cash across that doctor's cases. |

One inconsistency to be aware of: `lib/queries.ts:336` tags `[D3]` on a comment about
**capping the payment picker** (Dr. Adi alone has 500–820 implant cards), which has nothing
to do with commission percentages. Either D3 has a second meaning or that is a mis-tag.
Don't infer D3 from that site.

---

## 5. Traps — read before changing money code

### 5.1 Never write to the DB outside `lib/mutations.ts`

`db.insert/update/delete` appears in six files only: `mutations.ts`, `settlement.ts`,
`server-utils.ts`, and the `seed`/`demo`/`reset-pin` scripts. Zero in `app/`, `components/`,
`lib/actions/` or `queries.ts`.

This is not stylistic. The mutations layer is what writes the audit log, marks closed
periods stale, and allocates implant card numbers. A write that bypasses it produces a
record the clinic cannot trace and a settled month that silently disagrees with its own
snapshot.

### 5.2 `lab_entries` is tracking, not money

The single most dangerous confusion in this codebase, and it has already been called out in
`CLAUDE.md` §4 and `docs/OWNER-NOTES.md` §9.

There are **two different lab numbers**:

- `cases.labCost` — the lab cost of a specific case. *May* be deducted from a doctor's
  share, if `labDeductedPerDoctor` is on (D6).
- `labEntries` — the per-doctor lab dues ledger. **Tracked only.** Never in a payout, never
  in clinic cash, and a late entry against a closed month must **not** mark it stale (the
  only legitimate `recordEdit({markStale:false})` caller).

Treating the second as the first silently deducts money from doctors' shares. Any screen
showing «مستحقات المختبر» must say it is tracking. See `tests/lab-dues.test.ts`.

### 5.3 Money is integer dinars

No floats, ever. Parse with `parseAmount()`, display with `formatIQD()`. Compute totals
server-side; never trust a client total. If you add a formula, put it in
`lib/settlement-math.ts` so the preview and the snapshot share one implementation.

### 5.4 X-rays are excluded by construction, not by filtering

`computeSettlement()` asks for the three doctor buckets (`implant`, `ortho`, `normal`) **by
name**. The `xray` bucket is therefore excluded structurally. Don't "simplify" this into
summing all buckets and subtracting X-rays — the current shape means a *new* bucket is
excluded from payouts by default, which is the safe direction.

Related: the daily-entry treatment field is free text, and
`findOrCreateTreatmentType` refuses any name matching a non-normal bucket. Implants, ortho
and X-rays are opened from their own screens. A test that types «زراعة» into daily entry
**fails correctly**.

### 5.5 Ortho has no total

Ortho is المقدمة plus a per-session amount. There is **no** الإجمالي and no المتبقي anywhere
in ortho, and ortho never appears in «الديون». Adding a total would invent a number the
clinic never agreed to. `docs/OWNER-NOTES.md` §8.

### 5.6 Nothing may tell the clinic this is a test system

No demo banner, no «غير مؤكد» badge, no TODO or placeholder or lorem text. Demo data is
loaded by `npm run db:demo` before handover, never from inside the app. Build-phase caveats
go in `docs/OWNER-NOTES.md`, not on screen.

Also: never «تسجيل» as a verb in visible copy (it reads as sign-up) — use إضافة / حفظ / حجز.
Patient balances are «الديون»; «مستحقات» means **doctor** dues only.

### 5.7 Base UI, not Radix

shadcn here uses the **Base UI** registry. Composition is `render={<Comp/>}`, **not**
`asChild`. For form selects prefer the native `<NativeSelect>` in `components/forms/`.

### 5.8 The database cannot be swapped while running

A restore **stages** the file; the swap happens on the next start via `applyPendingRestore()`
in `lib/paths.ts`, before the connection opens. You cannot replace the file under a live
`better-sqlite3` handle. Same reason `make-demo-db.mjs` checkpoints the WAL and leaves WAL
mode: a shipped `.db` must be self-contained, and `stage-app.mjs` refuses to package one
that still has a `-wal`/`-shm` sidecar.

---

## 6. Commands

```bash
npm run db:setup     # migrate + seed. Default PIN 1234. No prices are seeded, by design.
npm run dev          # dev server
npm run build && npm start   # production, what the clinic runs (127.0.0.1 only)

npm test             # 50 tests — money arithmetic in isolation
npm run verify       # 37 assertions — D1–D9 end-to-end on a throwaway verify.db
npm run e2e          # browser tests, port 3100, own DB. Needs `npx playwright install` once.
npm run typecheck && npm run lint

npm run db:generate  # after a schema change, then npm run db:migrate
npm run dist:win     # Windows bundle. dist:win:demo for the pre-filled demo copy.
```

Three test layers, deliberately non-overlapping — **do not duplicate between them**.
Arithmetic goes in `tests/`. End-to-end money rules go in `scripts/verify.ts`. `e2e/` only
proves the screens are *connected* (it uses the existing `data-tour="…"` attributes as
selectors — reuse them, don't add CSS selectors).

After any Node upgrade: `npm rebuild better-sqlite3`, or every DB-touching script dies with
`ERR_DLOPEN_FAILED`.

---

## 7. Adding a screen

1. Read `docs/CONVENTIONS.md` — it has the full pattern and the Base UI API.
2. Reads → add to `lib/queries.ts`. Writes → add to `lib/mutations.ts`.
3. Action in `lib/actions/<feature>.ts`: `"use server"` → `await requireAuth()` → zod →
   mutation → `revalidatePath`.
4. Page is a Server Component. `"use client"` only for actual interactivity.
5. Add the route to `NAV_ITEMS` in `lib/strings.ts`, and put that same icon beside the `<h1>`.
6. Every money form shows its own arithmetic before saving, via `<MoneySummary>`. Display
   only — the server recomputes.
7. Every mutation confirms itself with `useActionToast`. Destructive actions get a confirm
   dialog, never a bare one-click delete.
8. RTL: logical properties only (`ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`). Tap targets
   `h-11` (≥44px). No horizontal scroll. Test narrow.
9. Real Arabic copy. No placeholder text.

Then: `npm run typecheck && npm run lint && npm test && npm run verify`.

---

## 8. Current state

At `47a5056` on branch `batch-2026-08-19` (this is the real tip; `master` is 17 commits
behind it). Version 2.0.0. Pushed to `github.com/perdark/dentest`, which is **public**.

Green: `npm test` 50/50 · `npm run verify` 37/37 · `typecheck` clean · `lint` clean ·
`npm run build` succeeds. `npm run e2e` needs `npx playwright install` first.

**Do not commit clinic source material.** The walkthrough videos, the 46 ledger stills in
`frames/`, the owner's audio note and the transcripts contain real patient names and were
stripped from git history before the first push. They are on disk, untracked, and
`.gitignore` now blocks them. The repo is public — keep them out.

Open items are in `docs/PROJECT-REVIEW-2026-09-21.md` §6. The one with a security
consequence: **changing the PIN from Settings does not invalidate existing sessions**
(`lib/actions/settings.ts:165` writes only `pinHash`, while `scripts/reset-pin.ts:36-38`
correctly rotates `sessionSecret` and explains why). Fix that before the next handover.
