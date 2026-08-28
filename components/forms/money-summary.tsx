import { formatIQD } from "@/lib/format";

export type MoneyFigure = {
  label: string;
  amount: number;
  /** يميّز الرقم الأهم في السطر (المتبقي عادةً). */
  emphasis?: boolean;
};

/**
 * سطر الحساب الحي أسفل نماذج المال: يعرض نتيجة الأرقام المكتوبة قبل الحفظ.
 * عرض فقط — المجاميع المعتمدة تُحسب دائماً في الخادم.
 */
export function MoneySummary({
  figures,
  suffix,
}: {
  figures: MoneyFigure[];
  suffix?: string;
}) {
  if (figures.length === 0) return null;
  return (
    // العنوان وحده باهت؛ الأرقام تُقرأ، والرقم الحاسم أكبرها.
    <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
      {figures.map((f) => (
        <span key={f.label} className="inline-flex items-baseline gap-1.5">
          <span className="text-muted-foreground">{f.label}</span>
          <span
            className={
              f.emphasis
                ? "money text-foreground text-base font-bold"
                : "money text-foreground text-sm font-semibold"
            }
          >
            {formatIQD(f.amount)}
          </span>
        </span>
      ))}
      {suffix ? <span className="text-muted-foreground">{suffix}</span> : null}
    </p>
  );
}
