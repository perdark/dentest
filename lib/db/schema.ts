import { sql } from "drizzle-orm";
import {
  sqliteTable,
  integer,
  text,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// All money is stored as INTEGER Iraqi Dinars (no floats).
// Business dates are TEXT "YYYY-MM-DD". Timestamps are INTEGER epoch ms.
const ts = () => integer("created_at").default(sql`(unixepoch() * 1000)`);

// ── Doctors ────────────────────────────────────────────────────────────────
export const doctors = sqliteTable("doctors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  isOwner: integer("is_owner", { mode: "boolean" }).notNull().default(false),
  doesOrtho: integer("does_ortho", { mode: "boolean" }).notNull().default(false),
  // What work this doctor actually takes. `doesOrtho` came first and drives
  // «التقويم»; these two complete the set so «الدفتر اليومي» and «الزراعة» can
  // offer only the doctors who do that kind of work instead of the whole list.
  // Both default to true so an existing clinic keeps every doctor selectable
  // until someone narrows it from «الأطباء» — silently hiding doctors after an
  // upgrade would look like data loss.
  doesImplants: integer("does_implants", { mode: "boolean" }).notNull().default(true),
  doesNormal: integer("does_normal", { mode: "boolean" }).notNull().default(true),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  // Commission percent (0-100). NULL = UNCONFIRMED with clinic.
  commissionPct: integer("commission_pct"),
  // Every doctor uses his own lab (e.g. علي → «دوبرا»). Free text, editable:
  // the clinic changes labs without telling anyone. NULL = not recorded yet.
  labName: text("lab_name"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: ts(),
});

// ── Lab entries (مستحقات المختبر) ───────────────────────────────────────────
/**
 * What a doctor owes his own lab — TRACKED ONLY. [قرار العيادة 2026-08-19]
 *
 * This money never touches clinic cash and never enters a settlement payout:
 * the arrangement is between the doctor and his lab, and the clinic only keeps
 * the running note so nobody has to remember it. That is why nothing here is
 * joined into `computeSettlement`, and why `cases.labCost` (the optional D6
 * per-case deduction) stays a completely separate number — confusing the two
 * would silently start deducting lab money from doctors' shares.
 *
 * `amount` is signed: a payment to the lab is entered negative, so the branch
 * total is what is still outstanding.
 */
export const labEntries = sqliteTable(
  "lab_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    doctorId: integer("doctor_id")
      .notNull()
      .references(() => doctors.id),
    // كل مختبر فرعان: ثابت / متحرك — وكل تسجيل موسوم بفرعه.
    branch: text("branch", { enum: ["fixed", "mobile"] }).notNull(),
    entryDate: text("entry_date").notNull(), // YYYY-MM-DD
    amount: integer("amount").notNull(),
    note: text("note"),
    // اختياري: أحياناً يُربط التسجيل بمريض بعينه، وأحياناً هو حساب شهري مجمّع.
    patientId: integer("patient_id").references(() => patients.id),
    createdAt: ts(),
  },
  (t) => [
    index("lab_entries_doctor_idx").on(t.doctorId),
    index("lab_entries_date_idx").on(t.entryDate),
  ],
);

// ── Patients ───────────────────────────────────────────────────────────────
export const patients = sqliteTable(
  "patients",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    address: text("address"),
    notes: text("notes"),
    // Chronic conditions the doctor must be warned about before he treats:
    // a JSON array of MEDICAL_FLAGS keys (lib/strings.ts). NULL = nothing
    // recorded, which is deliberately different from "checked and clear" —
    // the clinic never has to guess whether a blank means healthy or unasked.
    medicalFlags: text("medical_flags"),
    // Free text beside the flags: the medicine, the kind of allergy, anything
    // the treating doctor should read before he starts.
    medicalNotes: text("medical_notes"),
    // الطبيب المسؤول: who the patient is registered under, recorded at the desk
    // before any case exists. **Required** on «المرضى» — both the form and
    // `lib/actions/patients.ts` refuse to save without it.
    //
    // The column stays nullable all the same, and that is not a contradiction:
    // every patient registered before 2026-09-22 has no answer to give, and a
    // NOT NULL would have to invent one for each of them. NULL therefore means
    // exactly "registered before the field existed" — no new record can produce
    // it. `findOrCreatePatient` (appointment booking) is the other writer that
    // can leave it NULL; the booking screen keeps its own optional doctor.
    //
    // This is the *registration* doctor, not the treating one: the doctor who
    // actually did the work is always `cases.doctor_id`, and money (settlement,
    // commission, lab) reads that column only. Nothing here touches D1–D9.
    doctorId: integer("doctor_id").references(() => doctors.id),
    createdAt: ts(),
  },
  (t) => [
    index("patients_name_idx").on(t.fullName),
    index("patients_phone_idx").on(t.phone),
    index("patients_doctor_idx").on(t.doctorId),
  ],
);

// ── Treatment types (fixed, seeded) ─────────────────────────────────────────
export const treatmentTypes = sqliteTable("treatment_types", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(), // implant, ortho, extraction_surgical, ...
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  // Settlement bucket: how this rolls up in the monthly report.
  // "xray" is deliberately outside the three doctor buckets: X-ray money is
  // clinic income and is never part of a doctor's commissionable base, so the
  // settlement's per-doctor sums simply never ask for it. [D9]
  settlementBucket: text("settlement_bucket", {
    enum: ["implant", "ortho", "normal", "xray"],
  }).notNull(),
  isImplant: integer("is_implant", { mode: "boolean" }).notNull().default(false),
  isOrtho: integer("is_ortho", { mode: "boolean" }).notNull().default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── Price list (one active price per treatment type) ────────────────────────
/**
 * DORMANT ON PURPOSE — do not "finish" this feature.
 *
 * «قائمة الأسعار» was removed on 2026-08-19: this clinic's price varies per
 * patient, so every case is priced when it is opened and the system never
 * suggests a figure. The table was left in place rather than migrated away, and
 * nothing in lib/, app/ or components/ reads or writes it.
 *
 * It is recorded here because the decision lives in docs/OWNER-NOTES.md §7 and
 * BRIEF.md — neither of which anyone is reading while looking at a table
 * definition. An unused table with an obviously missing screen is exactly the
 * shape someone completes by accident. [dormant]
 */
export const priceList = sqliteTable("price_list", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  treatmentTypeId: integer("treatment_type_id")
    .notNull()
    .unique()
    .references(() => treatmentTypes.id),
  defaultPrice: integer("default_price").notNull().default(0),
  // Placeholder prices until the clinic sends the real list.
  isPlaceholder: integer("is_placeholder", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at").default(sql`(unixepoch() * 1000)`),
});

// ── Cases (a course of treatment = implant card / ortho case / walk-in) ──────
export const cases = sqliteTable(
  "cases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    patientId: integer("patient_id")
      .notNull()
      .references(() => patients.id),
    doctorId: integer("doctor_id")
      .notNull()
      .references(() => doctors.id), // opening doctor
    treatmentTypeId: integer("treatment_type_id")
      .notNull()
      .references(() => treatmentTypes.id),
    openedDate: text("opened_date").notNull(), // YYYY-MM-DD
    status: text("status", { enum: ["open", "completed", "cancelled"] })
      .notNull()
      .default("open"),
    // Money (agreed). total = listPrice - discount, but editable override.
    listPrice: integer("list_price").notNull().default(0), // snapshot at open
    discount: integer("discount").notNull().default(0), // amount
    totalPrice: integer("total_price").notNull().default(0), // agreed total
    // Implant-specific
    implantCardNo: integer("implant_card_no"), // sequential, implants only
    accountSeqNo: integer("account_seq_no"), // sequential account no
    device: text("device"), // جهاز
    addressSnapshot: text("address_snapshot"),
    labCost: integer("lab_cost").notNull().default(0), // record-keeping (D6)
    labExternal: integer("lab_external", { mode: "boolean" }).notNull().default(true),
    // Ortho-specific
    // المقدمة المتفق عليها — رقمٌ يُحدَّد عند فتح الحالة ثم يُسدَّد على دفعات
    // (kind = "down_payment")، لا مبلغٌ يُقبض مرة واحدة. [قرار العيادة 2026-08-25]
    // صفر = لم تُحدَّد مقدمة. غير مستعمل خارج التقويم.
    downPaymentAgreed: integer("down_payment_agreed").notNull().default(0),
    hasComplaint: integer("has_complaint", { mode: "boolean" }).notNull().default(false),
    complaintNote: text("complaint_note"),
    nextAppointment: text("next_appointment"), // YYYY-MM-DD
    notes: text("notes"),
    createdAt: ts(),
    updatedAt: integer("updated_at").default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("cases_patient_idx").on(t.patientId),
    index("cases_doctor_idx").on(t.doctorId),
    index("cases_type_idx").on(t.treatmentTypeId),
    index("cases_status_idx").on(t.status),
    index("cases_implant_card_idx").on(t.implantCardNo),
  ],
);

// ── Payments (one session collection = one daily-ledger line) ───────────────
export const payments = sqliteTable(
  "payments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    caseId: integer("case_id")
      .notNull()
      .references(() => cases.id),
    // Credited doctor for settlement. Defaults to the case's doctor but may
    // differ (mid-treatment switch, owner runs a session). [D2]
    doctorId: integer("doctor_id")
      .notNull()
      .references(() => doctors.id),
    amount: integer("amount").notNull(), // signed dinars; refund is negative [D5]
    kind: text("kind", {
      enum: ["down_payment", "session", "refund", "adjustment"],
    })
      .notNull()
      .default("session"),
    paidDate: text("paid_date").notNull(), // YYYY-MM-DD
    note: text("note"),
    createdAt: ts(),
  },
  (t) => [
    index("payments_case_idx").on(t.caseId),
    index("payments_doctor_idx").on(t.doctorId),
    index("payments_date_idx").on(t.paidDate),
  ],
);

// ── X-ray films (سجل الأشعة) [D9] ───────────────────────────────────────────
/**
 * صورة أشعة — بلا مريض وبلا طبيب. [قرار العيادة 2026-08-25]
 *
 * كانت الأشعة تُسجَّل «حالة» على مريض بسعر ودفعات، فتلاحق المريض في «الديون».
 * العيادة قالت إن الصورة بيعٌ نقدي في لحظته: نوعها، وهل صُوِّرت **داخل** العيادة
 * أم جاءت من **خارجها**، وسعرها. لا اسم، ولا دَين، ولا طبيب.
 *
 * لذلك الفيلم **مدفوع بالكامل بتاريخه**: `price` هو ما دخل الصندوق يومها، وهو
 * ما يقرأه `cashOnHand` و«دخل الأشعة» في الحصيلة. ويبقى الحكم الأصلي كما هو:
 * **دخل الأشعة للعيادة ولا يدخل حصة أي طبيب**، فلا عمود `doctor_id` هنا أصلاً
 * — الرقم لا يستطيع أن يتسرّب إلى حصة أحد. [D9]
 *
 * `placement` وصفٌ لا حساب: الداخل والخارج كلاهما دخل للعيادة، والتقسيم يُقرأ
 * للمتابعة فقط.
 */
export const xrayFilms = sqliteTable(
  "xray_films",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    filmDate: text("film_date").notNull(), // YYYY-MM-DD
    treatmentTypeId: integer("treatment_type_id")
      .notNull()
      .references(() => treatmentTypes.id),
    placement: text("placement", { enum: ["internal", "external"] })
      .notNull()
      .default("internal"),
    price: integer("price").notNull().default(0),
    createdAt: ts(),
  },
  (t) => [
    index("xray_films_date_idx").on(t.filmDate),
    index("xray_films_type_idx").on(t.treatmentTypeId),
  ],
);

// ── Appointments (light scheduling = السجل الرئيسي: name + appointment) ──────
export const appointments = sqliteTable(
  "appointments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    patientId: integer("patient_id")
      .notNull()
      .references(() => patients.id),
    doctorId: integer("doctor_id").references(() => doctors.id),
    apptDate: text("appt_date").notNull(), // YYYY-MM-DD
    apptTime: text("appt_time"), // HH:MM, optional for older/flexible bookings
    status: text("status", { enum: ["booked", "came", "no_show"] })
      .notNull()
      .default("booked"),
    note: text("note"),
    createdAt: ts(),
  },
  (t) => [index("appointments_date_idx").on(t.apptDate)],
);

// ── Expenses (monthly clinic running costs = سجل الصرفيات) ───────────────────
export const expenses = sqliteTable(
  "expenses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    expenseDate: text("expense_date").notNull(), // YYYY-MM-DD
    category: text("category", {
      enum: [
        "food",
        "water",
        "general",
        "dental_materials",
        "dental_lab",
        "installments",
        "other",
      ],
    }).notNull(),
    amount: integer("amount").notNull(),
    note: text("note"),
    createdAt: ts(),
  },
  (t) => [
    index("expenses_date_idx").on(t.expenseDate),
    index("expenses_cat_idx").on(t.category),
  ],
);

// ── Cash movements (non-payment cash in/out: reserves, payouts, draws) [D8] ──
export const cashMovements = sqliteTable(
  "cash_movements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    moveDate: text("move_date").notNull(), // YYYY-MM-DD
    type: text("type", {
      enum: ["reserve", "withdrawal", "owner_draw", "payout", "adjustment"],
    }).notNull(),
    amount: integer("amount").notNull(), // signed: inflow +, outflow -
    refTable: text("ref_table"),
    refId: integer("ref_id"),
    note: text("note"),
    createdAt: ts(),
  },
  (t) => [index("cash_movements_date_idx").on(t.moveDate)],
);

// ── Monthly settlements (Layer 2 snapshot per doctor/period) ────────────────
export const monthlySettlements = sqliteTable(
  "monthly_settlements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    period: text("period").notNull(), // YYYY-MM
    doctorId: integer("doctor_id")
      .notNull()
      .references(() => doctors.id),
    collectedImplant: integer("collected_implant").notNull().default(0),
    collectedOrtho: integer("collected_ortho").notNull().default(0),
    collectedNormal: integer("collected_normal").notNull().default(0),
    collectedTotal: integer("collected_total").notNull().default(0),
    accruedTotal: integer("accrued_total").notNull().default(0),
    labCost: integer("lab_cost").notNull().default(0),
    commissionPct: integer("commission_pct"), // snapshot at close [D3]
    payout: integer("payout").notNull().default(0),
    status: text("status", { enum: ["draft", "closed", "stale"] })
      .notNull()
      .default("draft"), // [D4]
    closedAt: integer("closed_at"),
    paidAt: integer("paid_at"),
    snapshotJson: text("snapshot_json"),
    notes: text("notes"),
    createdAt: ts(),
    updatedAt: integer("updated_at").default(sql`(unixepoch() * 1000)`),
  },
  (t) => [uniqueIndex("settlement_period_doctor_idx").on(t.period, t.doctorId)],
);

// ── Settings (single row id=1) ──────────────────────────────────────────────
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey().default(1),
  clinicName: text("clinic_name").notNull().default("عيادة الأسنان"),
  pinHash: text("pin_hash"),
  sessionSecret: text("session_secret"),
  currency: text("currency").notNull().default("IQD"),
  openingCashBalance: integer("opening_cash_balance").notNull().default(0),
  // ── UNCONFIRMED knobs (Layer 2) — defaults marked for clinic verification ──
  cashReserveThreshold: integer("cash_reserve_threshold").notNull().default(5000000),
  labDeductedPerDoctor: integer("lab_deducted_per_doctor", { mode: "boolean" })
    .notNull()
    .default(false), // [D6] off by default
  pctAppliedAfterLab: integer("pct_applied_after_lab", { mode: "boolean" })
    .notNull()
    .default(true), // inactive while labDeductedPerDoctor=false
  defaultCommissionPct: integer("default_commission_pct").notNull().default(50),
  staffSalaryMode: text("staff_salary_mode").notNull().default("manual"),
  // Set when the demo dataset is loaded, cleared when the records are wiped.
  // Its only job is to make «this is not real clinic data» impossible to miss:
  // a clinic that starts real work on top of the demo would have fake money in
  // its books forever. NULL = the records are the clinic's own.
  demoDataAt: integer("demo_data_at"),
  // ── Guided tours already seen ──
  // 🔴 Was `localStorage`, which broke in the packaged app: `electron/main.js`
  // starts the Next server on `srv.listen(0, ...)` — a **fresh random port on
  // every launch** — and localStorage is scoped to the origin *including the
  // port. So each launch got an empty store and the welcome tour reappeared
  // forever. It never reproduced in a browser, where the port is fixed.
  // The database lives in `userData`, so it is immune to that and to a cache
  // clear. Stored as a JSON array of pathnames, e.g. `["/dashboard"]`.
  toursSeen: text("tours_seen").notNull().default("[]"),
  updatedAt: integer("updated_at").default(sql`(unixepoch() * 1000)`),
});

// ── Counters (safe sequence allocation) ─────────────────────────────────────
export const counters = sqliteTable("counters", {
  name: text("name").primaryKey(), // implant_card_no | account_seq_no
  value: integer("value").notNull().default(0),
});

// ── Audit log (replaces big/small dual-ledger; edit-safety) ─────────────────
export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entity: text("entity").notNull(),
  entityId: integer("entity_id"),
  action: text("action", { enum: ["insert", "update", "delete"] }).notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  hitClosedPeriod: integer("hit_closed_period", { mode: "boolean" })
    .notNull()
    .default(false), // [D4]
  period: text("period"),
  note: text("note"),
  at: integer("at").default(sql`(unixepoch() * 1000)`),
});

// ── Case teeth (مخطط الأسنان) ───────────────────────────────────────────────
// One row per marked target on a case. See docs/TOOTH-CHART-SPEC.md.
//
// A doctor does not always mean a tooth. «قلع» is a tooth, «حشوة» is a face of
// a tooth, «الفك العلوي» is an arch and «تقويم»/«تنظيف» is the whole mouth.
// `scope` records which of those was meant, so «الفك العلوي» stays ONE row and
// is never expanded into 16 tooth rows — the expansion would lose the meaning.
//
// Tooth codes are FDI/ISO 3950 two-digit (11..48 permanent, 51..85 primary).
// The reference data for them lives in `lib/db/teeth.ts`, in code rather than
// in a table: it never changes, so there is nothing to migrate or seed.
export const caseTeeth = sqliteTable(
  "case_teeth",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    caseId: integer("case_id")
      .notNull()
      .references(() => cases.id),
    scope: text("scope", { enum: ["tooth", "arch", "mouth"] })
      .notNull()
      .default("tooth"),
    toothCode: integer("tooth_code"), // FDI; NULL unless scope="tooth"
    arch: text("arch", { enum: ["upper", "lower"] }), // NULL unless scope="arch"
    // Faces touched, only meaningful for a filling. JSON array of Surface.
    surfaces: text("surfaces"), // JSON string; NULL = whole tooth
    // Bridge span: members share spanId, the ends are abutments.
    spanId: integer("span_id"),
    spanRole: text("span_role", { enum: ["abutment", "pontic"] }),
    note: text("note"), // the doctor's own words, still allowed
    createdAt: ts(),
  },
  (t) => [
    index("case_teeth_case_idx").on(t.caseId),
    index("case_teeth_tooth_idx").on(t.toothCode),
  ],
);


export type Doctor = typeof doctors.$inferSelect;
export type Patient = typeof patients.$inferSelect;
export type TreatmentType = typeof treatmentTypes.$inferSelect;
export type Case = typeof cases.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type MonthlySettlement = typeof monthlySettlements.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type CaseTooth = typeof caseTeeth.$inferSelect;
export type XrayFilm = typeof xrayFilms.$inferSelect;
