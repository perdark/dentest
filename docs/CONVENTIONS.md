# Zuha — build conventions (read before adding a screen)

Local on-prem clinic app. Next.js 16 (App Router, RSC) · TypeScript · Tailwind v4 ·
shadcn (**Base UI** registry) · SQLite + Drizzle (one file `zuha.db`). Arabic, **RTL**,
Iraqi Dinar. Single shared PIN. No cloud.

## Where things live
- `lib/db/schema.ts` — the 13 tables (source of truth for columns).
- `lib/queries.ts` — **all reads** screens need (lists, balances, daily ledger, debts, dashboard…).
- `lib/mutations.ts` — **all writes** (patients, cases, payments, cash movements, X-rays). Money rules D1–D9 live here.
- `lib/settlement.ts` — monthly settlement math + close/reopen.
- `lib/server-utils.ts` — getSettings, cashOnHand, recordEdit, nextCounter, period helpers.
- `lib/format.ts` — `formatIQD`, `formatIQDShort`, `formatNumber`, `parseAmount`.
- `lib/dates.ts` — `todayISO`, `monthOf`, `currentPeriod`, `formatDateAr`, `formatPeriodAr`, `isValidISODate`.
- `lib/strings.ts` — Arabic label maps (treatments, categories, statuses, nav).
- `components/ui/*` — shadcn (Base UI). `components/forms/SubmitButton`, `NativeSelect`.

## Hard rules
1. **Never write to the DB from a screen.** Call `lib/mutations.ts` / `lib/settlement.ts`. They handle
   audit logging + closed-period staleness (D4) + implant numbering. Reads go through `lib/queries.ts`.
2. **Money = integer dinars.** Parse user input with `parseAmount()`, display with `formatIQD()`.
   Never floats. Totals/discounts computed **server-side** in the action, never trusted from the client.
3. **Server actions**: a file `lib/actions/<feature>.ts` starting with `"use server"`, each action
   validates with `zod`, calls a mutation, then `revalidatePath(...)`. Redirect with `next/navigation`.
4. **Authenticate every server action** with `await requireAuth()` before validation or mutation.
   The protected layout improves navigation UX, but it is not an authorization boundary for actions.
5. **RTL + mobile-first**: logical classes only (`ms-/me-/ps-/pe-/start-/end-`), tap targets ≥ 44px
   (`h-11`), no horizontal scroll, test narrow widths. The page is already `dir="rtl"`.
6. **Every money form shows its own arithmetic** before it is saved, via
   `components/forms/money-summary.tsx` (`<MoneySummary figures={[…]} />`). Display only — the
   authoritative total is always recomputed server-side. The clerk must never have to submit to
   find out what a discount or a part payment leaves owing.
7. **Every page header carries its nav icon** beside the `h1`
   (`<h1 className="flex items-center gap-2 …"><Icon className="text-muted-foreground size-6 shrink-0" />…`),
   using the same icon the sidebar uses for that route (`NAV_ITEMS` in `lib/strings.ts`). Empty
   states get the same icon large and muted.

## Base UI component API (NOT Radix — important)
- Composition uses **`render={<Comp/>}`**, not `asChild`. e.g.
  `<DialogTrigger render={<Button>فتح</Button>} />`.
- `Dialog`/`Sheet`: control with `open` / `onOpenChange` (client). Title is required for a11y.
- `Select` (Base UI) emits a hidden input when given `name` — but for forms **prefer the native
  `<NativeSelect name=... defaultValue=...>`** from `components/forms/native-select`. Simpler + mobile.
- Tooltip provider prop is `delay` (already mounted globally).
- `Button` sizes: `default|sm|lg|xs|icon|icon-sm|icon-lg`. Variants: `default|outline|secondary|ghost|destructive|link`.

## Pattern: an entry form (plain form + server action)
```tsx
// page.tsx (server component) — fetch options via lib/queries, render <form action={myAction}>
// lib/actions/<feature>.ts
"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { recordCasePayment } from "@/lib/mutations";
export async function recordPayment(formData: FormData) {
  await requireAuth();
  const data = z.object({ caseId: z.coerce.number(), amount: z.string(), ... }).parse(Object.fromEntries(formData));
  recordCasePayment({ caseId: data.caseId, amount: parseAmount(data.amount), paidDate: ..., });
  revalidatePath("/daily");
}
```

## Layer 2 = UNCONFIRMED
Commission %, the lab/% formula, the 5M rule, and salaries are unconfirmed clinic numbers. They live in
Settings as editable fields — never hardcode them in a screen. They carry **no** "غير مؤكد" badge:
the clinic is not the audience for our open questions. Track what is still unconfirmed in
`docs/OWNER-NOTES.md`.

## Clinic-facing copy
This is a premium clinic's records system, not a demo. Nothing on screen may read as unfinished,
provisional, or accusatory:
- No "غير مؤكد", no "بيانات تجريبية", no TODO/placeholder/lorem text.
- Patient balances are «الديون» / «رصيد متبقٍ». (Reversed 2026-08-19: the clinic asked for «الديون»
  explicitly; the earlier «never دَين» rule is dead. «مستحقات» is now reserved for **doctor** dues.)
  Tone stays neutral — reserve red (`text-destructive`) for genuinely negative amounts
  (refunds, voids), never for a patient balance.
- Never «تسجيل» as an action verb in visible copy (it reads as sign-up/login): use
  إضافة / حفظ / حجز — «إضافة دفعة», «حفظ الأشعة», «حجز موعد».
- Empty cells use `<EmptyValue>` (`components/ui/empty-value.tsx`), never a bare "—".
- «الأسعار» are never pre-filled. «قائمة الأسعار» was removed 2026-08-19 — every case is priced by
  hand when it is opened, because the clinic's price varies per patient.
- «مستحقات المختبر» is tracking, never a deduction. Any screen showing it must say so, or the
  clinic will read it as money taken off a doctor's share (see `docs/OWNER-NOTES.md` §9).

## Every mutation confirms itself
A save the user cannot see is a save the user repeats. Any form calling a server action wires
`useActionToast(state, "تم …", onSuccess)` from `components/forms/use-action-toast.ts` — it fires once
per completed action and owns the dialog-close/reset side effect. Destructive actions get a confirm
dialog first (see `delete-expense-button.tsx`), never a bare one-click delete.
