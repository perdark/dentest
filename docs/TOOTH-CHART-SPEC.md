# مخطط الأسنان — tooth marker spec

Status: **spec, not built.** Written 2026-08-24. Nothing in `lib/` or `app/` implements this yet
except `lib/db/teeth.ts` (the reference data, done and verified).

## 1. The problem this solves

Today the tooth is **prose inside a note**. From `lib/db/demo.ts`, real-shaped rows look like:

- `"زراعة ضرس علوي أيمن"`
- `"أشعة على الضرس العلوي"`
- `"حشوة ضرس"` · `"قلع جراحي"` · `"جسر ثلاثي"`

Consequences the clinic already lives with:
- You cannot ask *"what has been done to this patient's tooth 16?"* — no query can answer it.
- `"حشوة ضرس"` does not say **which** ضرس, or which **surface** of it. A second filling on the same
  tooth six months later is indistinguishable from a re-do of the first.
- A returning patient's history is a wall of sentences, re-read from scratch every visit.

The marker replaces the prose with a code. `"زراعة ضرس علوي أيمن"` becomes `case_teeth(case, 16)`.

## 2. Scope — the thing that makes this design non-obvious

The clinic's own phrasing («يشتغل الفك العلوي، أو سنين من الأمام، أو تقويم، أو قلع، أو حشوة»)
is not one kind of statement. It is **four different scopes**, and a UI that only lets you tap
individual teeth cannot express three of them:

| Doctor says | Scope | Selection | Stored as |
|---|---|---|---|
| «حشوة» | **surface** | one tooth, 1–3 of its faces | tooth + surfaces |
| «قلع» · «زراعة» · «علاج عصب» · «تاج» | **tooth** | 1..n teeth | tooth rows |
| «جسر» | **span** | ≥3 adjacent teeth, ends are abutments | ordered tooth rows + role |
| «سنين من الأمام» | **region** | anterior group | expands to teeth |
| «الفك العلوي» | **arch** | all 16 upper | arch marker, not 16 rows |
| «تقويم» | **arch or whole mouth** | no tooth at all | arch/mouth marker |
| «تنظيف» · بانوراما | **whole mouth** | no tooth at all | mouth marker |

**Design rule that falls out of this:** the chart must never *force* a tooth. Ortho and cleaning are
legitimately tooth-less. A required tooth field would make the clerk invent one, and invented data
is worse than the prose we are replacing.

Second rule: «الفك العلوي» is stored as **one arch marker**, never as 16 tooth rows. Storing the
expansion loses the doctor's actual meaning and makes the history unreadable.

## 3. Data model

Reference data is code, not a table — see `lib/db/teeth.ts`. 52 teeth (32 permanent + 20 primary),
FDI/ISO 3950 two-digit codes, Arabic names with correct gender agreement, per-tooth surface naming.

New table, one row per marked target on a case:

```ts
export const caseTeeth = sqliteTable("case_teeth", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  caseId: integer("case_id").notNull().references(() => cases.id),

  // Exactly one of these describes the target.
  scope: text("scope", { enum: ["tooth", "arch", "mouth"] }).notNull(),
  toothCode: integer("tooth_code"),          // FDI 11..85, NULL unless scope="tooth"
  arch: text("arch", { enum: ["upper", "lower"] }), // NULL unless scope="arch"

  // Faces, only meaningful for fillings. JSON array of Surface.
  surfaces: text("surfaces", { mode: "json" }).$type<Surface[]>(),

  // Bridge/span membership: same spanId, role marks the ends.
  spanId: integer("span_id"),
  spanRole: text("span_role", { enum: ["abutment", "pontic"] }),

  note: text("note"),                        // the doctor's own words, still allowed
  createdAt: ts(),
}, (t) => [
  index("case_teeth_case_idx").on(t.caseId),
  index("case_teeth_tooth_idx").on(t.toothCode),
]);
```

Constraints to enforce in the mutation (SQLite CHECK is not enough — do it in `lib/mutations.ts`):
- `scope="tooth"` ⟹ `toothCode` valid per `isValidToothCode()`, `arch` NULL.
- `scope="arch"` ⟹ `arch` set, `toothCode` NULL, `surfaces` NULL.
- `scope="mouth"` ⟹ both NULL.
- `surfaces` non-empty only when the case's treatment type is surface-scoped (filling).
- A tooth code may repeat across cases (history) but not within one case unless surfaces differ.

**Golden rule 1 applies:** every write goes through `lib/mutations.ts`, never from a screen.
Add `setCaseTeeth(caseId, marks[])` there — replace-all semantics, audit-logged via `recordEdit`.
Reads go in `lib/queries.ts`: `toothHistory(patientId, toothCode)` is the query that justifies
the whole feature.

## 4. Does it need to be 3D?

Asked for: 3D. Worth stating the tradeoff plainly before committing the clinic to it.

Every production dental system — Open Dental, Dentrix, and the paper chart the clinic uses now —
marks teeth on a **2D odontogram**: two rows of tooth shapes, upper and lower. It is not a
limitation they never escaped; it is faster. A 2D chart shows all 32 teeth at once with zero
occlusion, takes one tap per tooth, prints, and needs no GPU. A 3D mouth hides the lingual side
behind the buccal side, so marking a palatal surface costs an orbit first.

Where 3D genuinely wins is **showing the patient** — "this is your tooth, this is what we will do."
That is a real job in a clinic and paper cannot do it.

**Recommendation: build both, 2D first.**
1. 2D SVG odontogram for marking. Ships in days, no new dependency, prints, works on any laptop.
2. 3D viewer as a second tab reading the *same* `case_teeth` rows — a patient-explanation surface.

If 3D must be the only surface, use a fixed camera per arch (occlusal view from above/below) rather
than free orbit. That recovers most of 2D's speed while keeping the look.

## 5. What 3D needs (if/when built)

**Assets** — the part with the longest lead time, start here:
- Format **glTF 2.0 binary (`.glb`)**, Draco-compressed. One file, both arches.
- **One mesh per tooth**, named exactly `tooth_<FDI>` (`tooth_16`). The mesh name is the only link
  between the model and the data — a model shipped as one fused mesh is unusable, and this is the
  single most common way a purchased dental model fails.
- Budget ~2–5k triangles/tooth → 60–160k total. Fine for an integrated GPU.
- Gums as separate meshes so teeth can highlight independently.
- **Licence must permit commercial redistribution in a delivered client application.** Verify before
  buying — many dental models are personal-use only. This is a client deliverable; get it in writing.

**Runtime:**
- `three` + `@react-three/fiber` + `@react-three/drei`. Adds ~600KB–1MB gzip.
- **Everything bundled locally.** No CDN, no `useGLTF` from a URL — the clinic laptop is offline
  by design. The `.glb` goes in `public/`, loaded by relative path.
- `"use client"` + `next/dynamic` with `ssr: false`. The chart is an island; it must not pull
  three.js into the shared bundle for the other 16 screens.
- `frameloop="demand"` — a static mouth must not render at 60fps and drain a clinic laptop battery.
  Cap `dpr={[1, 1.5]}`, no shadows, no postprocessing.
- Selection by raycast → `mesh.name` → parse FDI → look up in `TEETH_BY_CODE`.
- Highlight by emissive on a cloned material, never by mutating the shared one.

**Verify on the clinic's actual laptop before promising it.** If the machine has no usable WebGL,
the 2D chart must still be a complete answer, not a degraded one.

## 6. The mirroring trap — read this before drawing anything

A dental chart is drawn as the doctor **faces the patient**. The patient's RIGHT side therefore
appears on the VIEWER's LEFT. Quadrant 1 (upper right) sits top-left on screen.

This is anatomy, not layout. **`dir="rtl"` must not flip it.** The page is RTL; the arch is not.
Wrap the chart in an element that resists the inherited direction, and write its internal geometry
with explicit coordinates rather than logical properties — this is the one place in Zuha where
`CONVENTIONS.md` rule 5 (logical classes only) does not apply, and the reason must be commented at
the call site or someone will "fix" it later.

A mirrored chart means extracting the wrong tooth. Treat it as a phase-9 pass/fail: mark tooth 16,
confirm it lit on the top-left.

## 7. Open questions for the clinic

Add to `QUESTIONS_AR.md` before the next meeting:

1. Do you treat children? (Decides whether the primary dentition, quadrants 5–8, ships at all.)
2. For a filling, do you record **which surface**, or just the tooth? (Decides if surfaces ship.)
3. Ortho — is it recorded per arch («علوي فقط» appears in the demo data) or always whole mouth?
4. Should the tooth be **required** on a قلع / زراعة case, or stay optional?
5. Existing cases have the tooth in prose. Backfill them by hand, or leave history as text and
   start structured from today? (Recommend: leave history, start fresh. No guessing at old notes.)
6. Do you want the chart to show **status** per tooth (missing / implanted / filled) accumulated
   across all past cases — a real odontogram — or only mark the current case?

Question 6 is the big one. It is the difference between a tagging widget and a patient chart, and
it changes `case_teeth` from a per-case list into a derived per-patient view.
