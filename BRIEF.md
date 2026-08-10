# Dentest — Clinic Records & Money System (decoded brief)

> Source: 2 handwritten "السجلات" spec photos + 4 walkthrough videos + 9-min audio note
> (`عراقي مول.m4a`). Iraqi dental clinic, amounts in **Iraqi Dinar (millions)**.
> Confidence: HIGH on structure (corroborated across photo + audio + ledger frames);
> MEDIUM on exact names/percentages (dialect transcription is approximate — verify with owner).

## The ask (in her words)
Replace the all-paper system (stacks of spiral notebooks + sticky-note debts) with software.
Quote: *"أحاول أسوّي هذا بالسستم"* — put all the registers into one system.

## People / roles
- **Dr. Adi (دكتور عدي / "دعدي")** — appears to be the owner; does **implants (زراعة)** + normal/surgical extraction (قلع جراحي/عادي). Has his own "owner" accounts separate from hired doctors.
- **Hired doctors:** Ali Qasim (علي قاسم), Dobra (دوبرا), Noor (نور). *(verify spellings/list)*
- **Dr. Zahra (زهرة)** — **orthodontics only (تقويم)**, exclusive, works **one day per week**.
- Each doctor has a **commission % (خصم/نسبة)** — e.g. 50%, 60% — applied to their monthly production.
- **Manager/accountant** (woman in the videos) — keeps the books, wants the daily/monthly tallies to be automatic.
- **Staff (موظفين)** — salaries paid out of leftover cash.

## Treatment types
Implants (زراعة) · Orthodontics (تقويم) · Bridges (جسور) · Fillings (حشوات) · Extraction/normal work (قلع / عمل عادي).
Dental work is done in **multiple sessions (جلسات)** — patients **pay in installments per visit**, not all at once.

## The registers (= the data model)

### 1. السجل الرئيسي — Main daily register
Per visit: patient name + **doctor** + procedure + **price**. End of day everything is consolidated.
A variant is "accounts only," grouped by doctor (each doctor's patients + what they did + price that day).

### 2. سجل الديون — Debts register
Because of installment payments, patients carry balances. Track:
**patient + date + phone number + remaining amount.** Purpose: a call-list to chase unpaid balances.

### 3. سجل المصروفات (السرفيات) — Expenses register (monthly)
Clinic running costs: **dental materials (مواد أسنان), lab fees (مختبر), food/water, installments, other.**
Logged so monthly clinic cost is known.

### 4. سجل التقويم — Orthodontics register
Dr. Zahra, one page per patient: **appointment + sessions + money.** Also feeds the main daily accounts.

### 5. سجل فهرس الزراعة — Implant index
Dr. Adi has ~**500–820 implant patients**, each given a **sequential number / card**. Index for fast
lookup (implants only — not ortho/fillings). Implant follow-up runs **~5 years**.

### 6. سجل الزراعة — Implant register (per-patient card)
Fields seen: **account sequence #, implant card sequence #, patient name, address, doctor,
down payment (المقدمة), total implant cost, amount paid, amount remaining, # of sessions,
appliance/device (جهاز), date.** Some lab work is done **externally**.

### 7. سجل الحسابات — Accounts ledger (BIG + SMALL)
- **Small (صغير):** working/scratch copy.
- **Big (كبير):** the clean, official one the doctor reviews — **must have zero errors**, holds the
  **doctor percentage cuts**.
- Reason for two: the small is a backup/draft so the official big one never gets messed up.
- **→ Software collapses this into ONE source of truth + audit history. This duplication is the #1 pain to kill.**

### Monthly reconciliation (the real goal)
Per doctor, per month: **sum(implants) + sum(ortho) + sum(normal work)** → apply **doctor's %** →
subtract **lab costs (حساب المختبر)** → doctor's payout.
Then clinic **total → staff salaries from the remainder**; rule mentioned: **if cash on hand > 5 million,
it's set aside from staff money** *(confirm exact intent — reserve/safe?)*.
Worked example from audio: implants 20M, collected 10M, normal work 5M.

## Refinements (from cleaner v2 transcript — confidence now ~90% on structure)
- Register #1 (main) holds only **patient name + appointment** ("علياته بيجاي"), NOT clinical details → there's a light scheduling element.
- Register #2 (per-doctor accounts) is explicitly **"the most important register"**: daily, columns per doctor (Adi / Ali Qasim / Dobra / Noor), each = patient + procedure + price; end-of-day each doctor's day-total is known.
- Doctors confirmed by name: **عدي (Adi), علي قاسم (Ali Qasim), دوبرا (Dobra), نور (Noor)**, + **زهرة (Zahra) = ortho only, exclusive, one day/week**.
- Expenses categories: **food, water, dental materials, dental-lab fees, other** — monthly.
- Ortho register flags patients with **complaints/special notes** for dispute protection ("حتى لا يجادلونا").
- Implant card fields confirmed: account seq #, implant-card seq #, name, address, doctor, **down payment (المقدمة)**, appliance/device, sessions, total, paid, remaining. **Lab work is done externally** at an agreed price. Card kept for **multi-year follow-up**; numbering avoids hunting card-by-card in the cabinet.
- Settlement is **collection-based**: "each session they pay part" — revenue is recognized as money is COLLECTED, not when work is promised (CONFIRM with clinic).
- Total flow: total account → **subtract lab cost** → doctor cuts. Whether the % is applied **before or after** the lab deduction is the key unconfirmed calc detail.

## Open questions for the clinic owner (need answers before/while building)
1. Confirm the **doctor list** + each doctor's **commission %**.
2. Is **"دعدي" = Dr. Adi the owner**? (His accounts are tracked separately from hired doctors.)
3. **Standard price list** per procedure, or free-typed amounts each time?
4. The **5-million cash rule** — what exactly should the system do with it?
5. How are **staff salaries** computed (fixed? share of leftover?)?
6. Do they want **appointment scheduling** in-app (video 5711 shows phone bookings + reservation #s), or money/records only?
7. **Users & roles:** reception/accountant (full entry) vs doctor (read monthly reports)? Login needed?
8. UI = **Arabic, RTL**, on a clinic desktop/laptop (and/or phone)?

## Proposed shape (for the build session)
- Entities: Patients, Doctors, Visits/Procedures, Implant cards, Ortho cases, Payments/installments,
  Debts (derived), Expenses, Labs, Doctor settlements (monthly), Staff/salaries.
- Screens: Daily entry (today's visits) · Patient profile (history + balance) · Implant index + card ·
  Ortho board · Debts call-list · Expenses · **Monthly settlement report per doctor** · Dashboard (cash, owed, this-month totals).
- Stack: LOCAL-FIRST (this is a single-clinic on-prem dashboard, NOT a cloud SaaS — overrides the
  global Supabase/Vercel default). Next.js (App Router, TS) + Tailwind + shadcn for UI; **SQLite**
  (Drizzle) as a single on-disk DB file; **server actions** write straight to SQLite (no RLS/cloud
  auth needed — one trusted machine); simple **PIN/password login**. Runs on the clinic laptop at
  localhost, no deployment. Arabic RTL, Iraqi Dinar. Backup = copy the .db file. Single source of
  truth replaces the big/small ledger duplication; auto-computes per-doctor cuts and remaining balances.

## Clinic answers — round 1 (2026-06-30)
CONFIRMED:
- Doctors = **Adi, Ali Qasim, Dobra, Noor, Zahra** — no others. Zahra = ortho only.
- **"دعدي" = Dr. Adi.** (Clinic owner not explicitly confirmed; treat Adi as the central/owner account.)
- A **fixed price list exists** + occasional **discounts for relatives** → need a per-visit manual price/discount override. (Clinic will send the list.)
- **Ortho = 2 days/week (one is Saturday), Dr. Zahra**, exclusive.
- **Treatment types are fixed:** implants, ortho, extraction (surgical/normal), fillings, bridges, cleaning. Nothing else.
- **~4 users, ONE shared PIN login** for now (no per-user accounts yet).

STILL UNKNOWN — clinic couldn't answer quickly. Build these as CONFIGURABLE settings with
sensible defaults + a visible "unconfirmed" flag, so plugging the real values later = no rebuild:
- each doctor's commission **%**.
- settlement formula: is the % applied **before or after** subtracting lab cost?
- the **"cash > 5 million"** rule (what to do with it).
- **staff salary** calculation.

## BUILD STRATEGY given the unknowns (TWO LAYERS)
- **Layer 1 — build fully now (needs no clinic answers):** patients, daily per-doctor visit log,
  procedures + price list (+ discount override), debts call-list (date/phone/remaining), implant
  cards + index, ortho register, monthly expenses, dashboard. This is ~70% of the app.
- **Layer 2 — structure now, numbers later:** the monthly per-doctor settlement + 5M rule + salaries.
  Build the report and the doctor-% field, drive the math from an editable **Settings** page with
  defaults (e.g. % applied AFTER lab deduction) clearly marked "to confirm with clinic." When the
  clinic answers, you edit settings — you don't touch code.
- The ONE concrete artifact worth chasing early: **the price list** (they said they can send it).
</content>
