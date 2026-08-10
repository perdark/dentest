# Dentest — build conventions (read before adding a screen)

Local on-prem clinic app. Next.js 16 (App Router, RSC) · TypeScript · Tailwind v4 ·
shadcn (**Base UI** registry) · SQLite + Drizzle (one file `dentest.db`). Arabic, **RTL**,
Iraqi Dinar. Single shared PIN. No cloud.

## Where things live
- `lib/db/schema.ts` — the 13 tables (source of truth for columns).
- `lib/queries.ts` — **all reads** screens need (lists, balances, daily ledger, debts, dashboard…).
- `lib/mutations.ts` — **all writes** (patients, cases, payments, cash movements). Money rules D1–D8 live here.
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
Settings with visible "غير مؤكد — يُراجع مع العيادة" badges. Never hardcode them in a screen.
