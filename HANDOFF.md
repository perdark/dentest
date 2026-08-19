# Handoff — Zuha, 2026-08-14 (session 2)

Session was a clinic-facing polish pass driven by a review of the running app, plus one
root-cause fix that explains several "it doesn't work" reports. **Everything below is done and
verified in a real browser.** Nothing is committed — the whole session is in the working tree.

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

Tours added for `/patients`, `/implants`, `/ortho`, `/debts`, `/expenses`, `/cash`, `/prices`,
`/audit`, `/help`, and a day-navigation step for `/appointments` — with `data-tour` anchors on
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
