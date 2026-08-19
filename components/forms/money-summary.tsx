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
    <p className="text-muted-foreground text-sm">
      {figures.map((f, i) => (
        <span key={f.label}>
          {i > 0 ? " · " : null}
          {f.label}{" "}
          <span
            className={
              f.emphasis
                ? "money text-foreground font-semibold"
                : "money font-semibold"
            }
          >
            {formatIQD(f.amount)}
          </span>
        </span>
      ))}
      {suffix ? ` · ${suffix}` : null}
    </p>
  );
}
