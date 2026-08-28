// Central Arabic UI labels and option lists.

export const TREATMENT_LABELS: Record<string, string> = {
  implant: "زراعة",
  ortho: "تقويم",
  extraction_surgical: "قلع جراحي",
  extraction_normal: "قلع عادي",
  filling: "حشوة",
  bridge: "جسر",
  cleaning: "تنظيف",
  xray_panoramic: "أشعة بانوراما",
  xray_periapical: "أشعة ذروية",
  xray_cbct: "أشعة ثلاثية الأبعاد",
  xray_ceph: "أشعة سيفالومترية",
};

/**
 * The settlement bucket that holds X-ray work. [D9]
 *
 * X-rays are billed to the patient like any other treatment, but the money is
 * the clinic's, not the treating doctor's: it never enters a commissionable
 * base and never appears in a payout. Everything that sums money per doctor
 * asks for the three doctor buckets by name, so a bucket that is not one of
 * them is excluded by construction rather than by remembering to filter.
 */
export const XRAY_BUCKET = "xray";

/**
 * The settlement bucket that holds orthodontic work. [2026-08-19]
 *
 * التقويم بلا إجمالي متفق عليه: تُفتح الحالة بمقدمة، ثم تُسعَّر كل جلسة عند
 * إضافتها. الحالة تُحفظ بإجمالي صفر، فلا يوجد «متبقٍ» لها ولا تظهر في الديون.
 * Everything that computes a patient balance names this bucket to exclude it,
 * so the rule holds for legacy rows that still carry a stored total.
 */
export const ORTHO_BUCKET = "ortho";

export const BUCKET_LABELS: Record<string, string> = {
  implant: "زراعة",
  ortho: "تقويم",
  normal: "عمل عادي",
  xray: "أشعة",
};

/**
 * Clinic-facing expense categories.
 *
 * `key` is what a new row stores; `absorbs` lists older keys that the same
 * category still has to display and total. «أكل» and «ماء» were two separate
 * categories at first — too blunt for the clinic's own books — and are now one
 * «مصاريف عامة». The `water` rows already in the database keep their stored
 * value (nothing is rewritten behind the clinic's back); they simply show and
 * add up under the merged category.
 */
export const EXPENSE_CATEGORIES = [
  { key: "food", label: "مصاريف عامة", absorbs: ["water"] },
  { key: "dental_materials", label: "مواد أسنان", absorbs: [] },
  { key: "dental_lab", label: "مختبر الأسنان", absorbs: [] },
  { key: "installments", label: "أقساط", absorbs: [] },
  { key: "other", label: "أخرى", absorbs: [] },
] as const;

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  EXPENSE_CATEGORIES.flatMap((c) => [
    [c.key, c.label],
    ...c.absorbs.map((k) => [k, c.label]),
  ]),
);

/** Month total for a category, including the keys it absorbed. */
export function expenseCategoryTotal(
  totals: Map<string, number>,
  category: (typeof EXPENSE_CATEGORIES)[number],
): number {
  return [category.key, ...category.absorbs].reduce(
    (sum, key) => sum + (totals.get(key) ?? 0),
    0,
  );
}

/**
 * الحالات الصحية المزمنة التي يجب أن يعرفها الطبيب قبل العلاج.
 *
 * The order is the order the checkboxes appear in and the order the labels are
 * read out in every warning, so the same patient always reads the same way.
 * Keys are stored in the database; only the Arabic labels are ever shown.
 */
export const MEDICAL_FLAGS = [
  "heart",
  "diabetes",
  "hypertension",
  "allergy",
  "bleeding",
  "asthma",
  "pregnancy",
  "kidney",
  "hepatitis",
] as const;

export type MedicalFlag = (typeof MEDICAL_FLAGS)[number];

export const MEDICAL_FLAG_LABELS: Record<MedicalFlag, string> = {
  heart: "قلب",
  diabetes: "سكري",
  hypertension: "ضغط الدم",
  allergy: "حساسية",
  bleeding: "سيولة الدم",
  asthma: "ربو",
  pregnancy: "حمل",
  kidney: "أمراض الكلى",
  hepatitis: "التهاب الكبد",
};

const MEDICAL_FLAG_SET = new Set<string>(MEDICAL_FLAGS);

/**
 * The stored JSON column -> the flags to show, in the canonical order.
 *
 * Anything unreadable or unknown is dropped instead of thrown: a warning strip
 * is not worth crashing a patient file over, and a key that no longer exists
 * must not resurface as a blank chip.
 */
export function parseMedicalFlags(json: string | null | undefined): MedicalFlag[] {
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const chosen = new Set(raw.filter((v): v is string => typeof v === "string" && MEDICAL_FLAG_SET.has(v)));
  return MEDICAL_FLAGS.filter((k) => chosen.has(k));
}

/** «قلب، سكري» — the flags as one readable line. Empty string when there are none. */
export function medicalFlagsLine(json: string | null | undefined): string {
  return parseMedicalFlags(json)
    .map((k) => MEDICAL_FLAG_LABELS[k])
    .join("، ");
}

/**
 * « ⚠ سكري، ضغط الدم» — appended to a picker label so the warning travels with
 * the name into every list the secretary picks a patient from.
 */
export function medicalFlagsMarker(json: string | null | undefined): string {
  const line = medicalFlagsLine(json);
  return line ? ` ⚠ ${line}` : "";
}

export const PAYMENT_KIND_LABELS: Record<string, string> = {
  down_payment: "مقدمة",
  session: "جلسة",
  refund: "استرجاع",
  adjustment: "تسوية",
};

export const CASE_STATUS_LABELS: Record<string, string> = {
  open: "مفتوح",
  completed: "مكتمل",
  cancelled: "ملغي",
};

export const SETTLEMENT_STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  closed: "مُقفل",
  stale: "يحتاج تحديث",
};

/**
 * الصورة داخل العيادة أم من خارجها — وصفٌ لا حساب. [قرار العيادة 2026-08-25]
 * الاثنان دخل للعيادة، والتقسيم للمتابعة فقط.
 */
export const XRAY_PLACEMENT_LABELS: Record<string, string> = {
  internal: "داخل",
  external: "خارج",
};

/** كل مختبر فرعان — وكل تسجيل موسوم بفرعه. [قرار العيادة 2026-08-19] */
export const LAB_BRANCH_LABELS: Record<string, string> = {
  fixed: "ثابت",
  mobile: "متحرك",
};

export const APPT_STATUS_LABELS: Record<string, string> = {
  booked: "محجوز",
  came: "حضر",
  no_show: "لم يحضر",
};

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  patients: "المرضى",
  cases: "الحالات",
  payments: "الدفعات",
  appointments: "المواعيد",
  expenses: "المصروفات",
  cash_movements: "الحركات النقدية",
  monthly_settlements: "الحصيلة الشهرية",
  doctors: "الأطباء",
  treatment_types: "أنواع العلاج",
  lab_entries: "مستحقات المختبر",
  price_list: "قائمة الأسعار",
  settings: "الإعدادات",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  insert: "إضافة",
  update: "تعديل",
  delete: "حذف",
};

export const CASH_MOVE_LABELS: Record<string, string> = {
  reserve: "احتياطي",
  withdrawal: "سحب",
  owner_draw: "سحب المالك",
  payout: "صرف حصة طبيب",
  adjustment: "تسوية",
};

export const NAV_ITEMS = [
  { href: "/dashboard", label: "لوحة التحكم", icon: "LayoutDashboard" },
  { href: "/appointments", label: "المواعيد", icon: "CalendarClock" },
  { href: "/daily", label: "الدفتر اليومي", icon: "CalendarDays" },
  { href: "/patients", label: "المرضى", icon: "Users" },
  { href: "/doctors", label: "الأطباء", icon: "Stethoscope" },
  { href: "/implants", label: "الزراعة (الفهرس)", icon: "IdCard" },
  { href: "/ortho", label: "التقويم", icon: "Smile" },
  { href: "/xrays", label: "الأشعة", icon: "Scan" },
  { href: "/debts", label: "الديون", icon: "PhoneCall" },
  { href: "/expenses", label: "المصروفات", icon: "Receipt" },
  { href: "/cash", label: "الحركات النقدية", icon: "Wallet" },
  { href: "/settlement", label: "الحصيلة الشهرية", icon: "Calculator" },
  { href: "/audit", label: "سجل التعديلات", icon: "History" },
  { href: "/help", label: "الدليل", icon: "BookOpen" },
  { href: "/settings", label: "الإعدادات", icon: "Settings" },
] as const;
