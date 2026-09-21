# Zuha — full project review, 2026-09-21

Review of the whole repository at `47a5056`, done when the project was first pushed to
GitHub. Everything below was checked by running it or reading it, not inferred from the
docs; where a claim comes from a doc rather than from execution it says so.

Reviewer note: this is a review, not a change log. The only code I changed while writing
it was one ESLint exemption (`47a5056`), because the repo had been lint-clean and a file
committed the same day broke that.

---

## 1. Verdict

This is a well-built system. The money logic is the part that would hurt the clinic if it
were wrong, and it is the part that has been treated most carefully: a single write path,
integer dinars throughout, decisions written down next to the code that implements them,
and three independent test layers that actually pass. I found no defect that puts a number
on screen wrong.

The one real gap I found is a security asymmetry: **changing the PIN from Settings does not
log anyone out** (§6.1). Everything else in §6 is documentation drift or a maintenance
trap, not a bug.

What is unusual, and worth saying plainly: the comments in this codebase explain *why*
rather than *what*, and several of them encode a clinic decision that would otherwise be
lost. `lib/settlement-math.ts` explaining why a negative payout is clamped, and
`lib/server-utils.ts` explaining why lab entries are the one thing that must not mark a
month stale, are both the kind of comment that stops a future contributor from "fixing"
something into a silent money bug.

---

## 2. What I verified by running it

| Gate | Command | Result |
|---|---|---|
| Money arithmetic | `npm test` (9 suites) | **50/50 pass** |
| D1–D9 end-to-end | `npm run verify` | **37/37 pass** |
| Types | `npx tsc --noEmit` | **clean** |
| Lint | `npm run lint` | **clean** (after `47a5056`) |
| Production build | `npm run build` | **succeeds**, 21 routes |
| Browser tests | `npm run e2e` | **could not run** — see §6.6 |

Node v26.7.0. The e2e failure is an environment gap (Playwright browsers not downloaded),
not a code failure: the suite aborted in `auth.setup.ts` before any test executed.

---

## 3. Shape of the codebase

~21k lines, excluding generated files.

| Area | Files | Lines |
|---|---|---|
| `app/` — routes and screens | 49 | 9,516 |
| `lib/` — data, money, actions | 36 | 7,357 |
| `components/` | 38 | 3,875 |
| `tests/` | 9 | 1,730 |
| `docs/` | 8 | 1,394 |
| `scripts/` | 5 | 665 |
| `e2e/` | 7 | 496 |
| `electron/` | 1 | 379 |
| `drizzle/` migrations | 9 | 231 |

16 tables, 44 read functions in `lib/queries.ts`, 30 write functions in `lib/mutations.ts`,
44 server actions across 14 files in `lib/actions/`, 15 nav-reachable screens plus a login
screen and 5 detail routes.

---

## 4. The invariants actually hold

The project states its rules in `CLAUDE.md` and `docs/CONVENTIONS.md`. I checked the three
that matter mechanically, across the whole tree rather than by sampling:

**All DB writes go through the mutations layer.** `db.insert|update|delete` appears in
exactly six files: `lib/mutations.ts`, `lib/settlement.ts`, `lib/server-utils.ts` (the
audit/staleness helper), and the three scripts `lib/db/seed.ts`, `lib/db/demo.ts`,
`scripts/reset-pin.ts`. **Zero** occurrences anywhere in `app/`, `components/`,
`lib/actions/` or `lib/queries.ts`. This rule is usually the first to rot in a codebase of
this size; here it is intact.

**Every server action authenticates.** All 14 files in `lib/actions/` have at least as many
`requireAuth()` calls as exported actions — 44 actions, 44 guards, no exceptions:

```
appointments 4/4 · cash 1/1 · debts 1/1 · doctors 5/5 · expenses 2/2 · implants 3/3
ortho 6/6 · patients 2/2 · payments 1/1 · settings 10/10 · settlement 3/3
tooth-chart 1/1 · visits 3/3 · xrays 2/2
```

This matters more than it looks. `proxy.ts` is only a cookie-presence redirect and says so
in its own comment — the real cryptographic check is `requireAuth()`. If actions relied on
the proxy, a forged cookie would be enough. They don't.

**Money stays integer.** `lib/settlement-math.ts` is pure integer arithmetic with
`Math.round` at each formula branch, and it is the single function both the browser preview
and the server snapshot call, so a preview can never disagree with what gets saved.

---

## 5. Notes on specific areas

### 5.1 Settlement — the core

`computeSettlement()` is the most consequential function in the project and it reads
clearly. Two design choices stand out as correct:

*X-ray exclusion is structural, not filtered.* D9 says X-ray income belongs to the clinic,
never a doctor. Rather than subtracting X-rays at the end, the per-doctor sums ask for the
three doctor buckets (`implant`, `ortho`, `normal`) **by name**, so the `xray` bucket cannot
reach a payout by construction. A new bucket added later would be excluded by default,
which is the safe direction to fail.

*Closed months report their snapshot, live months compute.* Every field is chosen by the
same `isClosed` test, and `shortfall` is derived from the same `formula` object as `payout`,
so the two can never describe different inputs. `clinicNet` deliberately reads X-ray income
and expenses live even for a closed month, with a comment explaining that a snapshot freezes
the doctors' shares and not the clinic's own books.

The negative-payout clamp in `settlement-math.ts` deserves specific credit: without it, a
month where lab cost exceeds a doctor's share would make the clinic appear to *profit* from
the shortfall. It clamps to zero and reports the uncovered amount separately as `shortfall`.
That is a subtle accounting trap, caught and documented.

### 5.2 Authentication

Correct primitives, correctly used: `scryptSync` for the PIN, HMAC-SHA256 for the session
token, `timingSafeEqual` on both comparisons, `httpOnly` + `sameSite: lax` cookie, 12-hour
expiry carried in the signed payload.

`lib/rate-limit.ts` is the right call for the threat model and explains itself: a 4-digit
PIN is 10,000 combinations, `start:lan` listens on the LAN, so an unthrottled login is
brute-forceable from a phone on the clinic wifi. Exponential lockout after 5 failures,
process-local state, with an explicit note on why losing the lockout on restart is
acceptable (the attacker cannot restart the process; the clinic can).

See §6.1 for the one gap.

### 5.3 Backup and restore

The staged-restore design is the best single piece of engineering in the repo. A SQLite
database cannot be swapped under a live `better-sqlite3` handle, so the restore **stages**
the chosen file and `applyPendingRestore()` performs the swap on next start, before the
connection opens. A safety copy of current records is taken first, so a wrong choice is
undoable. `tests/backup-restore.test.ts` covers all five cases including the one that would
actually bite — "stale WAL sidecars cannot replay over the restored database".

The same WAL awareness shows up in `scripts/make-demo-db.mjs`, which checkpoints and leaves
WAL mode so the shipped demo file is self-contained, and in `scripts/stage-app.mjs`, which
*refuses to package* a seed database that still has a `-wal` or `-shm` sidecar. Knowing this
class of bug once is common; defending against it in three places is not.

### 5.4 The demo bundle (newest work, `cbda32c`)

One Electron wrapper serves both bundles: `installSeedDatabase()` returns false when
`seed/zuha.db` is absent, which is exactly the clean build's case, so the code path is a
no-op there. The demo also carries a different `productName`, giving it its own
`%APPDATA%\Zuha Demo` folder — so fictional money cannot land in real books — and the demo
skips `adoptLegacyUserData()` so a real clinic's records can never be pulled into a demo
copy. `electron-builder.demo.cjs` derives from the real config rather than copying it, with
a comment recording the specific bug that a previous approach caused (appending `files`
exclusions scoped them to the wrong entry and shipped the wrong readme).

### 5.5 Two-layer strategy

The Layer 1 / Layer 2 split from `BRIEF.md` is honoured in the code. The four unconfirmed
clinic numbers — commission %, lab/% formula order, the 5M rule, salaries — are settings
rows, not constants. `lib/db/seed.ts` deliberately seeds `commissionPct: null` for every
doctor so an invented number never looks confirmed, and `normalizeCommissionPct()` treats
blank as "not set" and falls back rather than reading as 0%. Getting that fallback wrong
would quietly pay every doctor nothing.

---

## 6. Findings

### 6.1 Changing the PIN does not invalidate existing sessions — *medium*

`lib/actions/settings.ts:165` writes only the new hash:

```ts
updateSettings({ pinHash: hashPin(parsed.data.newPin) });
```

Session cookies are signed with `settings.sessionSecret`, which is independent of `pinHash`.
So every browser already logged in stays logged in for up to 12 more hours after the PIN
changes.

This is not a theoretical gap, because the project already knows the right answer. The CLI
path does rotate, with a comment saying why — `scripts/reset-pin.ts:36-38`:

```ts
// Rotating the secret invalidates every existing session cookie, so a
// logged-in browser cannot outlive the reset.
sessionSecret: newSecret(),
```

The in-app path is the one the clinic will actually use, and it is the one missing the
rotation. If the PIN is changed because someone left the practice, that person's open
session keeps working.

**Failure scenario.** Staff member is let go; the manager changes the PIN from الإعدادات
that evening. The ex-employee's browser session, opened that morning, still has a valid
cookie and full write access — patients, payments, settlement close — until it expires.

**Fix.** Add `sessionSecret: newSecret()` to the same `updateSettings` call, then
`destroySession()` so the person who changed it is sent back to the login screen and
re-authenticates with the new PIN. One line plus a redirect; it makes the UI path match the
CLI path that already documents this requirement.

### 6.2 Two comments justify a UI element that no longer exists — *low*

`lib/actions/settings.ts:114` and `lib/db/seed.ts:16-18` both explain their NULL handling in
terms of the «غير مؤكد» badge:

```ts
// Empty = UNCONFIRMED → store NULL so the «غير مؤكد» badge returns. [C1]
```

That badge was removed — `CLAUDE.md` §5 and `docs/CONVENTIONS.md` both say build-phase
caveats are not clinic-facing copy, and `grep 'غير مؤكد' app/ components/ --include=*.tsx`
returns nothing.

The **behaviour is still right** — NULL must mean "fall back to the default", never 0% — so
this is a comment fix, not a code fix. But it currently justifies the representation by
pointing at something a reader cannot find, which invites someone to conclude the NULL
handling is vestigial too. It is not; it is load-bearing.

### 6.3 `docs/CONVENTIONS.md` says 13 tables; there are 16 — *low*

`lib/db/schema.ts` defines: `doctors`, `labEntries`, `patients`, `treatmentTypes`,
`priceList`, `cases`, `payments`, `xrayFilms`, `appointments`, `expenses`, `cashMovements`,
`monthlySettlements`, `settings`, `counters`, `auditLog`, `caseTeeth`.

The three added after the line was written (`labEntries`, `xrayFilms`, `caseTeeth`) are each
significant — they carry the lab-dues, X-ray and tooth-chart features. Since CONVENTIONS.md
calls `schema.ts` "source of truth for columns", the stale count is more misleading than a
wrong number elsewhere would be.

### 6.4 The `D`/`A` decision tags have no canonical definition — *medium, maintainability*

The money rules are referenced as `[D1]`…`[D9]` and `[A1]`…`[A7]` in over 20 places across
`lib/`, `scripts/` and `app/`, and they are genuinely load-bearing: `[D9]` is why X-rays are
excluded by construction, `[D4]` is why closed months go stale, `[A2]` records that refunds
now net out and explicitly supersedes the original `[D5]`.

No file defines them. `docs/CONVENTIONS.md` says only "Money rules D1–D9 live here" and
points at `lib/mutations.ts`, whose header does not list them either. A new contributor
meeting `[A6]` has to reconstruct its meaning from the three call sites that mention it.

The tags are good practice — the missing piece is the table they point to. I have
reconstructed both sets in `docs/ONBOARDING-FOR-CLAUDE.md` §4 from their usages; that
table should be treated as derived, and confirmed against intent before it is relied on.

### 6.5 `priceList` is a dormant table — *low, trap*

`price_list` is declared in `lib/db/schema.ts:108` and referenced **nowhere else** in
`lib/`, `app/` or `components/`. This is deliberate and documented: «قائمة الأسعار» was
removed on 2026-08-19 because the clinic's price varies per patient, and the table was left
in place rather than migrated away.

Worth an explicit comment *in the schema file*, because the decision is recorded in
`docs/OWNER-NOTES.md` §7 and `BRIEF.md`, neither of which a contributor is reading while
looking at a table definition. A future Claude finding an unused table with a matching
Arabic screen missing is quite likely to "finish" the feature the clinic asked to have
removed.

### 6.6 `npm run e2e` needs an undocumented setup step — *low*

The suite aborts with `npx playwright install` guidance and runs nothing. `CLAUDE.md`
documents the e2e layer well — port 3100, throwaway DB, the `npm rebuild better-sqlite3`
requirement after a Node upgrade — but not that the browsers must be downloaded once.

Worth one line next to the existing `npm rebuild better-sqlite3` note, since both are
"works on the build machine, fails on a fresh clone" traps.

### 6.7 Observation, not a defect: the two big modules

`lib/mutations.ts` (1,162 lines) and `lib/queries.ts` (1,138 lines) are each approaching the
size where finding the right function costs real time. The read/write split is the right
seam and I would not break it. If they keep growing, the natural next cut is by feature
(`mutations/cases.ts`, `mutations/payments.ts`) re-exported from the current paths, so the
golden rule and every import keep working unchanged. Not urgent.

---

## 7. Repository hygiene — fixed during this review

The first push to GitHub failed, and the cause was substantive rather than transport.

**History weight.** The repo was **720 MB** because early commits contained `dist/` build
output: `Zuha.exe` at 213 MB and three installer zips at ~139 MB each. GitHub rejects any
single file over 100 MB, so the push could never have succeeded. `.gitignore` gained `/dist/`
in `9dd882e`, which stopped new commits but left the existing blobs in history.

**Clinic source material.** More seriously, the repo still tracked the raw material the
brief was decoded from: 4 walkthrough videos (`IMG_5711–5714.MOV`), 46 stills of the
clinic's paper ledgers in `frames/`, the owner's 9-minute audio note (`عراقي مول.m4a`), 10
transcript files, and 2 photographs of the handwritten spec. Spot-checking
`frames/p5711_03.jpg` and `frames/p5713_10.jpg` confirmed they show dated ledger pages with
columns of **real patient names and amounts**. The GitHub repo is public.

Both were resolved before anything was published: history was rewritten to strip `dist/`
and all clinic media from every commit, the 12 Arabic commit messages were preserved, and
`.gitignore` gained a `clinic source material` section so the files cannot be re-added. The
originals were restored to the working tree untracked — nothing was lost from disk. What
landed on GitHub is 208 files whose largest blob is `package-lock.json` at 497 KB.

**Recovery refs still exist locally.** The pre-rewrite tips are kept at
`refs/backup/pre-rewrite-batch` (`cbda32c`) and `refs/backup/pre-rewrite-master`
(`e0ae426`), plus git's own `refs/original/`. They are local-only and were not pushed. They
are what keeps the old blobs on disk, so the local clone is still ~720 MB. Once the push is
trusted, reclaiming that space is:

```bash
git for-each-ref --format='delete %(refname)' refs/backup refs/original | git update-ref --stdin
git reflog expire --expire=now --all && git gc --prune=now --aggressive
```

Do not run that while the rewrite is still unverified — it is the undo button.

**One loose end.** GitHub set the default branch to `batch-2026-08-19`, because it was
pushed first. That branch *is* the real tip; `master` is 17 commits behind it and is a
direct ancestor. Worth either renaming the working branch to `main`/`master` and merging, or
setting the default deliberately, so the repo does not permanently present a dated batch
name as its trunk.

---

## 8. What I would do next, in order

1. **Rotate `sessionSecret` in `changePin`** (§6.1). Only finding with a security
   consequence, and a one-line fix that makes the UI match the CLI.
2. **Add the D/A decision table to the repo** (§6.4) — promote the reconstruction in
   `docs/ONBOARDING-FOR-CLAUDE.md` §4 into the canonical source once it has been confirmed
   against intent, and point `docs/CONVENTIONS.md` at it.
3. **Fix the three doc-drift items** (§6.2, §6.3, §6.6) — comment rationale, table count,
   Playwright setup line. All small, all cheap to do together.
4. **Comment the dormant `priceList` table** in `schema.ts` (§6.5).
5. **Settle the default branch** (§7).
6. **Install Playwright and run the e2e suite**, so all four gates are green on a fresh
   clone rather than three of four.

Nothing in that list blocks handover. The money logic — the part a dental clinic will be
trusting with its books — passes 87 assertions across two independent layers, and the
invariants it relies on hold everywhere in the tree.
