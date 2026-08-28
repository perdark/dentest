import Link from "next/link";
import { formatPeriodAr } from "@/lib/dates";
import { APPT_STATUS_LABELS } from "@/lib/strings";

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

/**
 * الأعداد هي كل المعلومة في هذه الشبكة، فتُقرأ نصاً: «٣ محجوز» لا مربّع ملوّن
 * وحده. اللون يبقى للتمييز السريع، والكلمة هي ما يفصل حالة عن حالة.
 */
const COUNT_TONE: Record<"booked" | "came" | "noShow", string> = {
  booked: "bg-muted text-foreground",
  came: "bg-primary/15 text-primary",
  noShow: "bg-destructive/15 text-destructive",
};

const COUNT_LABEL: Record<"booked" | "came" | "noShow", string> = {
  booked: APPT_STATUS_LABELS.booked,
  came: APPT_STATUS_LABELS.came,
  noShow: APPT_STATUS_LABELS.no_show,
};

function CountChip({ kind, value }: { kind: "booked" | "came" | "noShow"; value: number }) {
  return (
    <span
      className={`flex items-center gap-1 rounded px-1 py-0.5 text-sm font-semibold ${COUNT_TONE[kind]}`}
    >
      <span dir="ltr" className="tabular-nums">
        {value}
      </span>
      <span className="truncate">{COUNT_LABEL[kind]}</span>
    </span>
  );
}

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
        <p className="text-lg font-semibold">{formatPeriodAr(period)}</p>
      </div>

      <div className="grid grid-cols-7 border-b">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="text-muted-foreground truncate px-1 py-2 text-center text-sm font-medium"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((date, i) => {
          if (!date) {
            return <div key={`pad-${i}`} className="min-h-24 border-b border-s" />;
          }
          const day = Number(date.slice(8));
          const cell = counts.get(date);
          const isToday = date === today;
          const isSelected = date === selected;

          return (
            <Link
              key={date}
              href={hrefFor(date)}
              aria-label={`${day}${isToday ? " — اليوم" : ""} — ${
                cell ? `${cell.total} موعد` : "بلا مواعيد"
              }`}
              aria-current={isSelected ? "date" : undefined}
              className={[
                "focus-visible:ring-ring flex min-h-24 flex-col gap-1 border-b border-s p-1.5 transition-colors focus-visible:ring-2 focus-visible:outline-none",
                isSelected ? "bg-primary/10 ring-primary/40 ring-1 ring-inset" : "hover:bg-muted/60",
              ].join(" ")}
            >
              {/* «اليوم» مكتوبة إلى جانب الرقم — لا يُميَّز بلونه وحده. */}
              <span className="flex items-center gap-1">
                <span
                  dir="ltr"
                  className={[
                    "text-sm tabular-nums",
                    isToday
                      ? "bg-primary text-primary-foreground inline-flex size-6 items-center justify-center rounded-full font-bold"
                      : "font-semibold",
                  ].join(" ")}
                >
                  {day}
                </span>
                {isToday ? (
                  <span className="text-primary text-sm font-semibold">اليوم</span>
                ) : null}
              </span>

              {cell ? (
                <span className="flex flex-col items-start gap-0.5">
                  {cell.booked > 0 ? <CountChip kind="booked" value={cell.booked} /> : null}
                  {cell.came > 0 ? <CountChip kind="came" value={cell.came} /> : null}
                  {cell.noShow > 0 ? <CountChip kind="noShow" value={cell.noShow} /> : null}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      {/* المفتاح: كل رقم في الشبكة مكتوب بجانبه اسم حالته — وهذا يربط اللون بها. */}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-4 py-3 text-sm">
        <span className="text-muted-foreground">ألوان الأعداد:</span>
        <span className={`rounded px-1.5 py-0.5 font-semibold ${COUNT_TONE.booked}`}>
          {COUNT_LABEL.booked}
        </span>
        <span className={`rounded px-1.5 py-0.5 font-semibold ${COUNT_TONE.came}`}>
          {COUNT_LABEL.came}
        </span>
        <span className={`rounded px-1.5 py-0.5 font-semibold ${COUNT_TONE.noShow}`}>
          {COUNT_LABEL.noShow}
        </span>
      </p>
    </div>
  );
}
