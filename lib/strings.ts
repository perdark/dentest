// Central Arabic UI labels and option lists.

export const TREATMENT_LABELS: Record<string, string> = {
  implant: "زراعة",
  ortho: "تقويم",
  extraction_surgical: "قلع جراحي",
  extraction_normal: "قلع عادي",
  filling: "حشوة",
  bridge: "جسر",
  cleaning: "تنظيف",
};

export const BUCKET_LABELS: Record<string, string> = {
  implant: "زراعة",
  ortho: "تقويم",
  normal: "عمل عادي",
};

export const EXPENSE_CATEGORIES = [
  { key: "food", label: "أكل" },
  { key: "water", label: "ماء" },
  { key: "dental_materials", label: "مواد أسنان" },
  { key: "dental_lab", label: "مختبر الأسنان" },
  { key: "installments", label: "أقساط" },
  { key: "other", label: "أخرى" },
] as const;

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.key, c.label]),
);

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
  { href: "/implants", label: "الزراعة (الفهرس)", icon: "IdCard" },
  { href: "/ortho", label: "التقويم", icon: "Smile" },
  { href: "/debts", label: "الديون", icon: "PhoneCall" },
  { href: "/expenses", label: "المصروفات", icon: "Receipt" },
  { href: "/cash", label: "الحركات النقدية", icon: "Wallet" },
  { href: "/prices", label: "قائمة الأسعار", icon: "Tags" },
  { href: "/settlement", label: "الحصيلة الشهرية", icon: "Calculator" },
  { href: "/audit", label: "سجل التعديلات", icon: "History" },
  { href: "/settings", label: "الإعدادات", icon: "Settings" },
] as const;
