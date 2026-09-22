# Handoff — Zuha, 2026-08-14 (session 2)

Session was a clinic-facing polish pass driven by a review of the running app, plus one
root-cause fix that explains several "it doesn't work" reports. **Everything below is done and
verified in a real browser.** Nothing is committed — the whole session is in the working tree.

> ### ⚠️ Correction added 2026-09-22 — two items below never reached the code
>
> This document is kept as the record of what that session did. Two of its claims were
> checked against the tree on 2026-09-22 and do not hold. §10 item 4 says nothing was
> committed; what followed was a **partial** commit, and these two were the casualties.
>
> 1. **§1 — the «الديون» → «المستحقات» rename did not land.** «المستحقات» appears in
>    **zero** files; «الديون» is still in twelve, including the nav (`lib/strings.ts`),
>    the dashboard tile, `/help` and the tour. §9's browser verification of this line no
>    longer describes the running app. The other two renames in §1 (شكوى → ملاحظة على
>    الحالة, and the أكل/ماء merge) **did** land. *(The expense merge was then reversed on
>    2026-09-22 at the clinic's request — see `lib/strings.ts`.)*
>
> 2. **§9 — `useDialog()` is not wired in.** `components/ui/use-dialog.ts` was imported by
>    nothing. Dialogs *do* close correctly, but through `useActionToast`, which §2
>    describes as owning "the close/reset side effect" — it superseded `useDialog` inside
>    this same session. The orphaned hook was deleted on 2026-09-22.
>
> Everything else in §2–§8 was spot-checked and is present: `use-action-toast.ts`,
> `day-picker.tsx`, `empty-value.tsx`, the expense delete confirmation, `allowedDevOrigins`
> and the `nativeButton={false}` fixes are all in the tree.

The previous handoff's open item (dialogs not closing after save) is **closed**: `useDialog()` is
wired in, and this session re-verified it — saving a patient closes the dialog, shows a
confirmation, and the row appears. See §9.

---

## 0. The root cause worth reading first — dev server served no client JS

`next.config.ts` now sets `allowedDevOrigins: ["127.0.0.1"]`.

Next 16 dev only serves `/_next/*` to hosts it recognises, and **`127.0.0.1` is not `localhost`**
to that check. The app is developed and run at `127.0.0.1` (that is what `npm start` binds and
what the Electron shell loads), so in dev every client chunk was refused with:

```
⚠ Blocked cross-origin request to Next.js dev resource /_next/webpack-hmr from "127.0.0.1"
```

The page still rendered — server HTML is unaffected — and then never hydrated. So in dev:
anything server-rendered worked (links, GET forms, «السابق»/«التالي») and everything
client-driven silently did nothing (dialogs, toasts, tabs, the tour). That is exactly the shape
of "the date navigation doesn't work but next/previous do" and "I added a patient and saw no
message".

**Production was never affected** — the setting is dev-only. But it made dev unreliable enough
to mask and mimic real bugs, so treat any future "this doesn't respond" report by checking the
dev-server log for that warning first.

## 1. Clinic-facing language and colour

| Was | Now | Why |
|---|---|---|
| الديون (+ red card, red amounts) | **المستحقات** (calm primary tint) | «دَين» reads as an accusation against the patient; red made a normal receivable look like an emergency. |
| شكوى / الشكاوى (red badge) | **ملاحظة على الحالة** (neutral badge) | Same tracking, no negative word in a premium clinic. Column «شكوى؟» → «ملاحظة», detail card «الموعد والشكوى» → «الموعد والملاحظات». |
| أكل · ماء (two categories) | **مصاريف عامة** (one) | Two blunt categories in a clinic's expense book. |

Renamed everywhere it surfaces: nav, page titles, cards, dashboard tile + quick action, tour
copy, `/help`. Route stays `/debts` (no one sees the URL inside the desktop app).

**Expense merge is non-destructive.** `EXPENSE_CATEGORIES[].absorbs` in `lib/strings.ts`: new
rows write `food`, and existing `water` rows still display and total under «مصاريف عامة» via
`expenseCategoryTotal()`. Nothing was rewritten in the database.

`text-destructive` is now reserved for genuinely negative amounts (refunds, voids, outflow), not
for balances owed.

## 2. Every mutation confirms itself

New `components/forms/use-action-toast.ts` — `useActionToast(state, message, onSuccess)`. Fires
once per completed action (compares `useActionState` object identity, not `state.ok`, so it
cannot re-fire on unrelated renders) and owns the close/reset side effect, so a screen never has
two effects racing on the same state.

Wired into **every** create/edit/delete: patients, daily entry (both modes), implant card
new/edit/session, ortho case/payment/meta, appointments book/mark/delete, expenses add **and
delete**, cash movement, prices, receivable payment, void payment, settlement payout.

`deleteExpenseAction` was a fire-and-forget `Promise<void>` behind a bare trash icon — one click,
no question, no feedback, a money line gone. It now returns state and goes through
`expenses/delete-expense-button.tsx`: confirm dialog first, toast after.

Toaster: top-centre, 3.5s, close button (`components/providers.tsx`).

## 3. Daily entry — «جديد» vs «دفعة» was unanswerable from the UI

Dialog titled «إضافة قيد جديد» with tabs «جديد» / «دفعة» gave no way to tell what either does.
Now: **«علاج جديد»** (opens a new case + its first payment) and **«دفعة على علاج سابق»** (adds a
payment to an existing open case), with a `DialogDescription` stating the difference in one line.

**Superseded 2026-09-22 (owner's call):** the «دفعة على علاج سابق» tab is gone. The daily dialog
opens a new case only — no tab bar — and a payment on an already-open case is recorded from
«الديون ← إضافة دفعة» (`recordDebtPayment`), which was always the other way in. `PaymentForm`,
`addVisitPayment` and `searchCollectableCases` were deleted with it.

## 4. Date picker on /daily and /appointments

The field sat in a GET form beside a «عرض» button, in a row of four outline buttons — nothing
tied the button to the field, so picking a date appeared to do nothing and staff walked to last
month one «السابق» at a time.

New `components/forms/day-picker.tsx`: choosing a date **is** the interaction — `router.push` on
`change`, no second step, pending state while it loads. `change` on a date input only fires on a
committed date, so it cannot navigate mid-typing. Uncontrolled with a `key` (a controlled value
fights the native segment editor). The «عرض» button is gone from both screens.

## 5. Nothing on screen says "test system"

Removed from the clinic-facing UI: the app-wide «بيانات تجريبية للتدريب» strip, every
«غير مؤكد — يُراجع مع العيادة» badge, the settlement amber banner, the «أسعار مبدئية» alert and
per-row «مبدئي» badges, the reserve-threshold "(غير مؤكد)" note, and the Settings demo-fill
button. Settings keeps a plain **«البدء من جديد»** wipe card; the doctor-percentage badge became
«لم تُحدَّد بعد» (an operational fact, not a project note).

**Demo data is now a pre-handover step: `npm run db:demo`.** The app no longer loads or announces
it.

Trade-off, stated plainly: with the banner gone, nothing warns a clinic that it is looking at
fictional money. Clearing before handover is now a human step — it is the first checklist item in
`docs/OWNER-NOTES.md`.

**`docs/OWNER-NOTES.md` is new and is where all of this went** — which numbers are still
unconfirmed and where to set them, the demo-data procedure, the rename rationale, the retained
`device` column. `CLAUDE.md` and `docs/CONVENTIONS.md` were updated too, since both *mandated*
the badges that were just removed.

## 6. Implant card — «الجهاز» removed

Gone from the new-card form, the edit dialog and the card detail. **The `device` column stays and
is not overwritten**: `updateImplantCard` no longer sends the key at all, and `updateCaseMeta`
patches only what it is given, so existing values survive.

## 7. Tour on every screen + motion

Tours added for `/patients`, `/implants`, `/ortho`, `/debts`, `/expenses`, `/cash`, `/prices`
(that screen was removed 2026-08-19 and its tour went with it), `/audit`, `/help`, and a day-navigation step for `/appointments` — with `data-tour` anchors on
each screen. Detail routes deliberately have none; there «؟» opens الدليل. Half-coverage was
worse than none: staff stop pressing a button that behaves differently each time.

Motion (`app/globals.css`, transform/opacity only, capped for a low-end laptop):

- `.animate-page` on `<main>`, keyed on pathname — every navigation registers.
- `.animate-stagger` on dashboard tiles, quick actions, cash/expense figures, daily ledger.
- Tour spotlight travels between steps; panel pops in once then slides.
- Nav: icon scale on hover, press feedback, shadow on the active item.
- **`prefers-reduced-motion` kills all of it**, document-wide.

## 8. Also fixed

16 × `<Button render={<Link/>}>` were throwing a Base UI console error on every page (a Button
asserting a native `<button>` while rendering an `<a>`). All now pass `nativeButton={false}` —
the dev overlay was showing "2 Issues" on the daily screen alone.

Empty cells no longer print «—» anywhere. `components/ui/empty-value.tsx` gives a quiet worded
placeholder («بلا رقم», «لا توجد دفعات», «غير محدَّد») where absence needs explaining, and blank
where it is self-evident. A dash beside an amount reads as a minus sign.

## 9. Verification

- `npx tsc --noEmit`, `npx eslint app components lib` — clean.
- `npm test` — **17/17 pass** (6 settlement, 9 payment, 2 audit).
- `npm run app:build` — build + stage succeeded, 20 routes, `build/app` 27.4 MB.
- **In-browser (Chrome, 127.0.0.1:3000)**:
  - Date picker: changing the month segment navigated to `/daily?date=2026-07-14` and the heading
    followed to «14 تموز 2026» — no button.
  - Add patient: dialog opened, saved, **closed**, toast «تمت إضافة المريض بنجاح», row appeared
    with «بلا رقم» in the phone column.
  - `/debts` renders «المستحقات» with the calm card; `/expenses` shows one «مصاريف عامة» category
    totalling 160,280 (= 86,782 + 73,498, the two food rows — merge maths correct).
  - `/patients` tour opens at "1 / 4" with the dimmed spotlight.

## 10. Open items

1. **`dist/Dentest-0.1.0-win-x64.zip` is stale** — dated Aug 10, still carrying the pre-rename
   name. `build/app` (what `npm run app:start` runs) is current; the Windows installer is not.
   Run `npm run dist:win` when you want a distributable.
2. **One test row in `zuha.db`**: patient «مريض اختبار التأكيد», created while verifying the
   toast. `npm run db:demo:clear && npm run db:demo` resets the demo dataset.
3. Prettier is not enforced repo-wide — `npx prettier --check` fails on 63 files, most untouched
   this session. Either adopt it and format everything in one commit, or drop it.
4. Nothing is committed. Suggested split: (a) `allowedDevOrigins` + `nativeButton` fixes,
   (b) clinic-facing copy/colour, (c) toasts + delete confirmation, (d) date picker, (e) tour +
   motion, (f) docs.

---

# Addendum — 2026-09-22 (session 4): audit of `1923cc0`, then six fixes

Session 3 (`1923cc0`) was tested A-to-Z rather than extended. Every automated layer reproduced
green, and the manual pass session 3 never ran — all twelve checks in its own handoff — was
driven through the real UI against both `npm start` and the packaged `Zuha.exe`. Nothing in the
four changes of `1923cc0` was wrong. Six defects were found around them, all older than that
commit, and all six are fixed in the working tree.

## What the audit confirmed

| Layer | Before | After |
|---|---|---|
| `npm run typecheck` / `npx eslint .` | silent | silent |
| `npm test` | 50 | **53** (+1 future-dated payment, +2 `isRecordableDate`) |
| `npm run verify` | 37 | **36** (−1: it checked a screen that no longer exists) |
| `npx playwright test` | 31 | **32** (+1: «الديون» offers two kinds, bounded date) |
| Manual pass §4.1–§4.12 | never run | 12/12, on `npm start` **and** `Zuha.exe` |
| 15 screens × desktop + mobile, demo volume | never run | no console error, no 4xx, no overflow |

## The six fixes

1. **«تسوية» recorded cash that never arrived.** `/help` told the clinic «تسوية» لتصحيح حساب,
   and nothing in the codebase branched on `kind === "adjustment"` — it was stored positive and
   counted by every money reader. Correcting a 600,000 over-billing with one instead *credited*
   600,000: cash on hand, the doctor's collected total and half of it as payout, on money that
   never reached the drawer. «النوع» on «الديون» is now **جلسة / استرجاع** only; «مقدمة» went
   with it because its only cap guards open-ended ortho, which that screen never lists.
   Correcting a line is «إلغاء دفعة» (`deletePayment`), which `/help` now says.
   Both labels stay in `PAYMENT_KIND_LABELS` so historic rows still read correctly, and the
   `kind` column still accepts all four. **Not a migration — no row changed.**
2. **A payment could be dated any year.** `isValidISODate` only asks whether a day exists, so
   «2099-12-31» saved: the money left «تحصيل الشهر» and the settlement while still counting in
   «النقد المتوفر» and against the patient. New `isRecordableDate()` (`lib/dates.ts`) bounds it
   to `[EARLIEST_RECORD_DATE, today]`, enforced in `recordCasePayment`, `recordXrayFilm` and
   `createCase`, and on every record-date input as `min`/`max`. **Appointments are exempt** —
   see golden rule 6 in `CLAUDE.md`.
3. **`openCasesBrief()` was production-dead and `verify` guarded a deleted screen.** It fed the
   «دفعة على علاج سابق» picker `1923cc0` removed; afterwards its only callers were
   `scripts/verify.ts` and `tests/ortho-open-total.test.ts`, so `npm run verify` printed
   `✓ ortho: a case is not in the daily payment picker` about a picker that was gone. Query,
   `collectableCaseCount()`, and both assertions deleted.
4. **«مقدمة» on «الديون» was inert** — confirmed by probe, removed with fix 1.
5. **Nine exports with no reference anywhere** deleted: `getTreatmentType`, `TREATMENT_LABELS`,
   `BUCKET_LABELS`, `medicalFlagsMarker`, `formatIQDShort`, `isPinSet`, `PERMANENT_TEETH`,
   `PRIMARY_TEETH`, `posteriorTeeth`. Each site keeps a one-line note saying what left and why.
6. **Two wrong lines in `CLAUDE.md`**: `db:setup` seeds **4** doctors, not 5; and
   `npm run build && npm start` is a browser convenience, not what the clinic runs — Next warns
   `"next start" does not work with "output: standalone"` for exactly that reason. The clinic
   runs `electron/main.js` → `.next/standalone/server.js`.

## Two scares that were not bugs — do not re-chase

- **The packaged app does not lose data.** An intermediate run left the exe's database holding
  an expense but zero cases. That was the harness: Playwright's `--grep-invert` is
  case-insensitive, so `"LEDGER"` also excluded the case-creating test whose title ends "…in the
  day's ledger". Rerun clean against a fresh install: 11 passed, every row persisted.
- **The `revalidatePath` gaps are harmless.** `recordDebtPayment` revalidates only `/debts`,
  `/daily` and `/dashboard`, which looks like staleness for `/settlement`. Every app route builds
  as `ƒ` dynamic; nothing is cached.

## Still open

- **A refund is unreachable on a fully settled case.** «الديون» lists only cases carrying a
  balance and is now the only entry point. Not a regression — the removed daily picker had the
  same constraint — but the clinic has still never been asked. Worth a question.
- `EARLIEST_RECORD_DATE` is `2020-01-01`, chosen to catch a mistyped year rather than to date the
  clinic. If the clinic ever back-enters older paper records, lower it.

## Testing the packaged app without touching clinic data

`electron/main.js` hardcodes `ZUHA_DATA_DIR` to Electron's `userData`, so `ZUHA_DB` cannot
redirect it. Pass Chromium's own switch instead:

```
dist\win-unpacked\Zuha.exe --user-data-dir=C:\some\scratch\dir
```

It then migrates and seeds a fresh database there and serves on a random localhost port (find it
with `Get-NetTCPConnection -State Listen | Where-Object OwningProcess -in (Get-Process Zuha).Id`),
which a browser or Playwright can drive like any other server.

## Also in this working tree — «الطبيب المسؤول» on a patient (migration 0010)

Separate from the six fixes, and the only schema change of the session:
`patients.doctor_id` (migration `0010_glossy_hobgoblin`, plus `patients_doctor_idx`).

- **Required in the UI, nullable in the column.** «المرضى» refuses to save without a doctor —
  both the form and `createPatient` / `updatePatient` in `lib/actions/patients.ts`. The column
  stays nullable because every patient registered before 2026-09-22 has no answer to give;
  NULL therefore means exactly "registered before the field existed". `findOrCreatePatient`
  (appointment booking) is the other writer that can still leave it NULL.
- **It is the registration doctor, not the treating one.** Money — settlement, commission,
  lab dues — reads `cases.doctor_id` only, and nothing in this change touches D1–D9.
- Surfaces: the patients list column, the patient page («الطبيب المسؤول»), and the patient form.
  `lib/queries.ts` lost a correlated-subquery filter in favour of the indexed column.
