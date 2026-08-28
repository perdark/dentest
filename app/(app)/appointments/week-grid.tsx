import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { formatDateShort, formatDateShortY, formatTime12, shiftISOByDays } from "@/lib/dates";
import { APPT_STATUS_LABELS } from "@/lib/strings";
import { Badge } from "@/components/ui/badge";

/**
 * عرض الأسبوع = سبعة أعمدة، كل عمود جدول أعمال يومه — لا مسطرة ساعات.
 *
 * الوقت في هذا البرنامج اختياري، والعيادة عملياً لا تُدخله: شبكة ساعات
 * ٨ ص–٨ م تعني شاشة خطوط فارغة بينما كل المواعيد الحقيقية منفيّة إلى شريط
 * أسفلها. قائمة اليوم تعمل في الحالتين — بوقت أو بلا وقت — ولا تعرض فراغاً أبداً.
 */

const WEEKDAYS = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

/**
 * لون شارة الحالة. تشاركه شاشة اليوم في `page.tsx` حتى لا تختلف الحالة الواحدة
 * بين العرضين. اللون تمييز إضافي فقط — الحالة مكتوبة نصاً في كل مكان.
 */
export const APPT_STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  booked: "outline",
  came: "default",
  no_show: "destructive",
};

/** الشارة الافتراضية ١٢px — أكبر منها هنا لأن الحالة قيمة تُقرأ لا زينة. */
const STATUS_BADGE = "h-6 px-2.5 text-sm";

type WeekAppointment = {
  id: number;
  patientId: number;
  patientName: string;
  doctorName: string | null;
  apptDate: string;
  apptTime: string | null;
  status: string;
};

/** المواعيد المؤقّتة أولاً بترتيب الساعة، ثم ما بلا وقت بترتيب الاسم. */
function byTimeThenName(a: WeekAppointment, b: WeekAppointment): number {
  if (a.apptTime && b.apptTime) return a.apptTime.localeCompare(b.apptTime);
  if (a.apptTime) return -1;
  if (b.apptTime) return 1;
  return a.patientName.localeCompare(b.patientName, "ar");
}

/** «بلا مواعيد» · «موعد واحد» · «موعدان» · «٣ مواعيد» · «١١ موعداً». */
function DayCount({ count }: { count: number }) {
  if (count === 0) {
    return <span className="text-muted-foreground text-sm">بلا مواعيد</span>;
  }
  if (count === 1) return <span className="text-sm font-semibold">موعد واحد</span>;
  if (count === 2) return <span className="text-sm font-semibold">موعدان</span>;
  return (
    <span className="text-sm font-semibold">
      <span dir="ltr" className="tabular-nums">
        {count}
      </span>{" "}
      {count <= 10 ? "مواعيد" : "موعداً"}
    </span>
  );
}

export function WeekGrid({
  startDate,
  appointments,
  today,
  selected,
  hrefFor,
}: {
  startDate: string;
  appointments: WeekAppointment[];
  today: string;
  selected: string;
  /** Builds a date link while retaining the current schedule filters. */
  hrefFor: (date: string) => string;
}) {
  const days = WEEKDAYS.map((weekday, index) => ({
    weekday,
    date: shiftISOByDays(startDate, index),
  }));
  const byDate = new Map<string, WeekAppointment[]>();
  for (const appointment of appointments) {
    const day = byDate.get(appointment.apptDate) ?? [];
    day.push(appointment);
    byDate.set(appointment.apptDate, day);
  }
  for (const day of byDate.values()) day.sort(byTimeThenName);
  // «بلا وقت» تُميّز موعداً عن مواعيد لها ساعة. إذا لم يكن لأي موعد في الأسبوع
  // ساعة — وهو الحال الغالب في العيادة — فهي لا تُميّز شيئاً وتتكرّر عشرات
  // المرات، فتُحذف ويبقى الاسم والطبيب والحالة وحدها في السطر.
  const weekHasAnyTime = appointments.some((appointment) => appointment.apptTime);

  return (
    <section data-tour="appt-week" className="overflow-hidden rounded-xl border">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold">تقويم الأسبوع</h2>
          <p dir="ltr" className="text-base font-semibold tabular-nums">
            {formatDateShort(startDate)} — {formatDateShortY(days.at(-1)?.date)}
          </p>
        </div>
        <p className="text-sm">
          <span className="text-muted-foreground">مواعيد الأسبوع:</span>{" "}
          <span dir="ltr" className="font-semibold tabular-nums">
            {appointments.length}
          </span>
        </p>
      </div>

      {/* التمرير الأفقي داخل القسم وحده — الصفحة نفسها لا تتزحزح. */}
      <div className="overflow-x-auto">
        <div className="grid min-w-[63rem] grid-cols-7">
          {days.map(({ weekday, date }) => {
            const dayAppointments = byDate.get(date) ?? [];
            const isToday = date === today;
            const isSelected = date === selected;

            return (
              <div key={date} className="flex min-w-0 flex-col border-s">
                <Link
                  href={hrefFor(date)}
                  aria-current={isSelected ? "date" : undefined}
                  className={[
                    "focus-visible:ring-ring flex flex-col items-center gap-0.5 border-b px-2 py-2 text-center transition-colors focus-visible:-outline-offset-2 focus-visible:ring-2 focus-visible:outline-none",
                    isSelected
                      ? "bg-primary/10 ring-primary/40 ring-1 ring-inset"
                      : "hover:bg-muted/60",
                  ].join(" ")}
                >
                  {/* «اليوم» مكتوبة، لا لوناً وحده. */}
                  <span className="flex min-h-6 items-center gap-1.5">
                    <span className="text-sm font-medium">{weekday}</span>
                    {isToday ? (
                      <span className="bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-sm font-bold">
                        اليوم
                      </span>
                    ) : null}
                  </span>
                  <span dir="ltr" className="text-base font-bold tabular-nums">
                    {formatDateShort(date)}
                  </span>
                  <DayCount count={dayAppointments.length} />
                </Link>

                {/* سقف ارتفاع العمود: الأسبوع كله يبقى على شاشة واحدة. */}
                <ul className="max-h-[26rem] flex-1 divide-y overflow-y-auto">
                  {dayAppointments.length === 0 ? (
                    <li className="text-muted-foreground flex flex-col items-center gap-1.5 px-2 py-6 text-center">
                      <CalendarDays className="size-6 opacity-40" aria-hidden="true" />
                      <span className="text-sm">لا مواعيد</span>
                    </li>
                  ) : (
                    dayAppointments.map((appointment) => (
                      <li key={appointment.id}>
                        <Link
                          href={`/patients/${appointment.patientId}`}
                          aria-label={[
                            appointment.patientName,
                            appointment.apptTime
                              ? formatTime12(appointment.apptTime)
                              : weekHasAnyTime
                                ? "بلا وقت محدد"
                                : null,
                            APPT_STATUS_LABELS[appointment.status] ?? appointment.status,
                          ]
                            .filter(Boolean)
                            .join("، ")}
                          className="hover:bg-muted/60 focus-visible:ring-ring flex min-h-11 flex-col gap-1 px-2.5 py-2.5 transition-colors focus-visible:-outline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
                        >
                          <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                            {appointment.apptTime ? (
                              <span dir="ltr" className="text-sm font-semibold tabular-nums">
                                {formatTime12(appointment.apptTime)}
                              </span>
                            ) : weekHasAnyTime ? (
                              <span className="text-muted-foreground text-sm font-medium">
                                بلا وقت
                              </span>
                            ) : null}
                            <Badge
                              variant={APPT_STATUS_VARIANT[appointment.status] ?? "outline"}
                              className={STATUS_BADGE}
                            >
                              {APPT_STATUS_LABELS[appointment.status] ?? appointment.status}
                            </Badge>
                          </span>
                          <span className="text-base leading-snug font-semibold">
                            {appointment.patientName}
                          </span>
                          <span
                            className={
                              appointment.doctorName ? "text-sm" : "text-muted-foreground text-sm"
                            }
                          >
                            {appointment.doctorName ?? "بلا طبيب"}
                          </span>
                        </Link>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
