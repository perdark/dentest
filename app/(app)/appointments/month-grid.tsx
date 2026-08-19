import Link from "next/link";
import { formatPeriodAr } from "@/lib/dates";

/**
 * أسبوع العراق يبدأ السبت وينتهي الجمعة — لا يبدأ الأحد. [ar-IQ]
 *
 * `Date.getDay()` يعطي 0 للأحد و6 للسبت، فالإزاحة `(getDay() + 1) % 7` تجعل
 * السبت أول عمود والجمعة آخره. الشبكة مبنية يدوياً لأن `Intl` لا يعطي تخطيط
 * شهر جاهزاً، والاعتماد على مكتبة تقويم كامل لهذه الشاشة وحدها مبالغة.
 */
const WEEKDAYS = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export type DayCounts = { booked: number; came: number; noShow: number; total: number };

export function MonthGrid({
  period,
  counts,
  today,
  selected,
  hrefFor,
}: {
  period: string;
  counts: Map<string, DayCounts>;
  today: string;
  selected: string;
  /** يبني رابط اليوم مع الحفاظ على المرشّحات الحالية. */
  hrefFor: (date: string) => string;
}) {
  const [year, month] = period.split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (firstOfMonth.getUTCDay() + 1) % 7;

  // خلايا فارغة قبل أول الشهر، ثم أيام الشهر. لا نملأ آخر الشبكة بأيام الشهر
  // التالي: صفٌّ ناقص أوضح من أرقام تخصّ شهراً آخر.
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${period}-${pad(i + 1)}`),
  ];

  return (
    <div data-tour="appt-month" className="rounded-xl border">
      <div className="border-b px-4 py-3">
        <p className="font-medium">{formatPeriodAr(period)}</p>
      </div>

      <div className="grid grid-cols-7 border-b">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="text-muted-foreground truncate px-1 py-2 text-center text-xs font-medium"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((date, i) => {
          if (!date) {
            return <div key={`pad-${i}`} className="min-h-16 border-b border-s" />;
          }
          const day = Number(date.slice(8));
          const cell = counts.get(date);
          const isToday = date === today;
          const isSelected = date === selected;

          return (
            <Link
              key={date}
              href={hrefFor(date)}
              aria-label={`${day} — ${cell ? `${cell.total} موعد` : "بلا مواعيد"}`}
              aria-current={isSelected ? "date" : undefined}
              className={[
                "focus-visible:ring-ring flex min-h-16 flex-col gap-1 border-b border-s p-1.5 transition-colors focus-visible:ring-2 focus-visible:outline-none",
                isSelected ? "bg-primary/10 ring-primary/40 ring-1 ring-inset" : "hover:bg-muted/60",
              ].join(" ")}
            >
              <span
                className={[
                  "text-xs tabular-nums",
                  isToday
                    ? "bg-primary text-primary-foreground inline-flex size-5 items-center justify-center rounded-full font-bold"
                    : "text-muted-foreground",
                ].join(" ")}
              >
                {day}
              </span>

              {cell ? (
                <span className="flex flex-wrap gap-0.5">
                  {cell.booked > 0 ? (
                    <span className="bg-muted text-foreground rounded px-1 text-[10px] font-semibold tabular-nums">
                      {cell.booked}
                    </span>
                  ) : null}
                  {cell.came > 0 ? (
                    <span className="bg-primary/15 text-primary rounded px-1 text-[10px] font-semibold tabular-nums">
                      {cell.came}
                    </span>
                  ) : null}
                  {cell.noShow > 0 ? (
                    <span className="bg-destructive/15 text-destructive rounded px-1 text-[10px] font-semibold tabular-nums">
                      {cell.noShow}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs">
        <span className="flex items-center gap-1">
          <span className="bg-muted inline-block size-2.5 rounded-sm" /> محجوز
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-primary/40 inline-block size-2.5 rounded-sm" /> حضر
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-destructive/40 inline-block size-2.5 rounded-sm" /> لم يحضر
        </span>
      </p>
    </div>
  );
}
