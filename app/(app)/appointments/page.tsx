import Link from "next/link";
import type { Metadata } from "next";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  appointmentsForDate,
  appointmentsForWeek,
  appointmentCountsForDate,
  appointmentCountsForMonth,
  upcomingAppointments,
  listDoctors,
} from "@/lib/queries";
import {
  todayISO,
  isValidISODate,
  formatDateAr,
  formatDateShortY,
  formatTime12,
  monthOf,
  shiftISOByDays,
  shiftISOByMonths,
  startOfWeekISO,
} from "@/lib/dates";
import { APPT_STATUS_LABELS } from "@/lib/strings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DayPicker } from "@/components/forms/day-picker";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { MonthGrid } from "./month-grid";
import { WeekGrid, APPT_STATUS_VARIANT } from "./week-grid";
import {
  BookAppointmentDialog,
  AppointmentActions,
  AppointmentFilters,
} from "./appointment-forms";

export const metadata: Metadata = { title: "المواعيد" };

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
      </CardContent>
    </Card>
  );
}

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    view?: string;
    doctorId?: string;
    status?: string;
  }>;
}) {
  const sp = await searchParams;
  const date = sp.date && isValidISODate(sp.date) ? sp.date : todayISO();
  // اليوم يبقى العرض الافتراضي — الأسبوع والشهر يُطلبان صراحةً. [عقد الجولة: appt-list]
  const view = sp.view === "month" || sp.view === "week" ? sp.view : "day";

  const doctorIdNum = Number(sp.doctorId);
  const doctorId =
    sp.doctorId && Number.isInteger(doctorIdNum) && doctorIdNum > 0 ? doctorIdNum : null;
  const status = sp.status && sp.status in APPT_STATUS_LABELS ? sp.status : "";
  const filters = { doctorId, status };

  const rows = appointmentsForDate(date, filters);
  const counts = appointmentCountsForDate(date);
  const doctors = listDoctors({ activeOnly: true }).map((d) => ({
    id: d.id,
    name: d.name,
  }));

  const period = monthOf(date);
  const monthCounts = view === "month" ? appointmentCountsForMonth(period, filters) : null;
  const upcoming = view === "month" ? upcomingAppointments(date, 6) : [];
  const weekStart = startOfWeekISO(date);
  const weekAppointments = view === "week" ? appointmentsForWeek(weekStart, filters) : [];

  // المرشّحات تُحمل مع كل رابط تنقّل، وإلا عاد العرض إلى «كل الأطباء» فجأة.
  const carry = (over: Record<string, string>) => {
    const q = new URLSearchParams();
    q.set("date", over.date ?? date);
    const nextView = over.view ?? view;
    if (nextView !== "day") q.set("view", nextView);
    if (doctorId) q.set("doctorId", String(doctorId));
    if (status) q.set("status", status);
    return `/appointments?${q.toString()}`;
  };

  const prevDate = shiftISOByDays(date, -1);
  const nextDate = shiftISOByDays(date, 1);
  const prevMonth = shiftISOByMonths(`${period}-01`, -1);
  const nextMonth = shiftISOByMonths(`${period}-01`, 1);
  const prevWeek = shiftISOByDays(weekStart, -7);
  const nextWeek = shiftISOByDays(weekStart, 7);

  return (
    // سبعة أعمدة تحتاج عرضاً أكبر من عمود اليوم الواحد.
    <div
      className={`mx-auto flex flex-col gap-4 ${view === "week" ? "max-w-6xl" : "max-w-3xl"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="text-muted-foreground size-6 shrink-0" />
          <div>
            <h1 className="text-2xl font-bold">المواعيد</h1>
            <p className="text-sm">
              <span className="text-muted-foreground">السجل الرئيسي — </span>
              <span className="font-medium">
                {view === "month" ? "عرض الشهر" : view === "week" ? "عرض الأسبوع" : formatDateAr(date)}
              </span>
            </p>
          </div>
        </div>
        <div data-tour="appt-add">
          <BookAppointmentDialog doctors={doctors} date={date} />
        </div>
      </div>

      {/* يوم / أسبوع / شهر */}
      <div data-tour="appt-view" className="flex flex-wrap items-center gap-2">
        <Button
          variant={view === "day" ? "default" : "outline"}
          className="h-11"
          nativeButton={false}
          render={<Link href={carry({ view: "day" })} />}
        >
          يوم
        </Button>
        <Button
          variant={view === "week" ? "default" : "outline"}
          className="h-11"
          nativeButton={false}
          render={<Link href={carry({ view: "week" })} />}
        >
          أسبوع
        </Button>
        <Button
          variant={view === "month" ? "default" : "outline"}
          className="h-11"
          nativeButton={false}
          render={<Link href={carry({ view: "month" })} />}
        >
          شهر
        </Button>
      </div>

      <AppointmentFilters
        doctors={doctors}
        date={date}
        view={view}
        doctorId={doctorId ? String(doctorId) : ""}
        status={status}
      />

      {/* تنقّل */}
      <div data-tour="appt-nav" className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          className="h-11 gap-1"
          aria-label={view === "month" ? "الشهر السابق" : view === "week" ? "الأسبوع السابق" : "اليوم السابق"}
          nativeButton={false}
          render={<Link href={carry({ date: view === "month" ? prevMonth : view === "week" ? prevWeek : prevDate })} />}
        >
          <ChevronRight className="size-4" />
          السابق
        </Button>

        <DayPicker
          basePath="/appointments"
          date={date}
          label="اختر يوم المواعيد"
          searchParams={{
            ...(view !== "day" ? { view } : {}),
            ...(doctorId ? { doctorId: String(doctorId) } : {}),
            ...(status ? { status } : {}),
          }}
        />

        <Button
          variant="outline"
          className="h-11 gap-1"
          aria-label={view === "month" ? "الشهر التالي" : view === "week" ? "الأسبوع التالي" : "اليوم التالي"}
          nativeButton={false}
          render={<Link href={carry({ date: view === "month" ? nextMonth : view === "week" ? nextWeek : nextDate })} />}
        >
          التالي
          <ChevronLeft className="size-4" />
        </Button>
      </div>

      {view === "week" ? (
        <WeekGrid
          startDate={weekStart}
          appointments={weekAppointments}
          today={todayISO()}
          selected={date}
          hrefFor={(d) => carry({ date: d, view: "day" })}
        />
      ) : view === "month" && monthCounts ? (
        <>
          <MonthGrid
            period={period}
            counts={monthCounts}
            today={todayISO()}
            selected={date}
            hrefFor={(d) => carry({ date: d, view: "day" })}
          />

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">المواعيد القادمة</h2>
            {upcoming.length === 0 ? (
              <Card>
                <CardContent className="text-muted-foreground py-8 text-center text-base">
                  لا توجد مواعيد قادمة بعد هذا اليوم.
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="flex flex-col divide-y px-0">
                  {upcoming.map((u) => (
                    <Link
                      key={u.id}
                      href={carry({ date: u.apptDate, view: "day" })}
                      className="hover:bg-muted/60 flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-(--card-spacing) py-3"
                    >
                      <span className="text-base font-semibold">{u.patientName}</span>
                      <span className="flex flex-wrap items-center gap-x-2 text-sm">
                        <span dir="ltr" className="font-semibold tabular-nums">
                          {formatDateShortY(u.apptDate)}
                        </span>
                        <span className={u.doctorName ? "" : "text-muted-foreground"}>
                          {u.doctorName ?? "بلا طبيب"}
                        </span>
                      </span>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}
          </section>
        </>
      ) : (
        <>
          <section data-tour="appt-counts" className="grid grid-cols-3 gap-3">
            <CountCard label="محجوز" value={counts.booked} />
            <CountCard label="حضر" value={counts.came} />
            <CountCard label="لم يحضر" value={counts.noShow} />
          </section>

          {rows.length === 0 ? (
            <Card data-tour="appt-list">
              <CardContent className="text-muted-foreground py-12 text-center text-base">
                <CalendarDays className="mx-auto mb-3 size-10 opacity-40" />
                {doctorId || status
                  ? "لا توجد مواعيد مطابقة للمرشّحات في هذا اليوم."
                  : "لا توجد مواعيد في هذا اليوم. اضغط «حجز موعد» لحجز أول موعد."}
              </CardContent>
            </Card>
          ) : (
            <Card data-tour="appt-list">
              <CardContent className="flex flex-col divide-y px-0">
                {rows.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-(--card-spacing) py-3"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                      {/* هدف لمس ≥44px — اسم المراجع هو مدخل ملفّه. */}
                      <Link
                        href={`/patients/${r.patientId}`}
                        className="text-primary inline-flex min-h-11 items-center text-base font-semibold underline-offset-4 hover:underline"
                      >
                        {r.patientName}
                      </Link>
                      <Badge
                        variant={APPT_STATUS_VARIANT[r.status] ?? "outline"}
                        className="h-6 px-2.5 text-sm"
                      >
                        {APPT_STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                      {r.apptTime ? (
                        <span dir="ltr" className="text-sm font-semibold tabular-nums">
                          {formatTime12(r.apptTime)}
                        </span>
                      ) : null}
                      <span className={r.doctorName ? "text-sm" : "text-muted-foreground text-sm"}>
                        {r.doctorName ?? "بلا طبيب"}
                      </span>
                      {r.phone ? (
                        /* هدف لمس ≥44px — يُتصل بالمريض من هنا لتأكيد الموعد. */
                        <a
                          href={`tel:${r.phone}`}
                          dir="ltr"
                          className="text-primary inline-flex min-h-11 items-center text-sm tabular-nums underline-offset-4 hover:underline"
                        >
                          {r.phone}
                        </a>
                      ) : null}
                      {r.note ? (
                        <span className="text-sm">
                          <span className="text-muted-foreground">ملاحظة:</span> {r.note}
                        </span>
                      ) : null}
                    </div>

                    <AppointmentActions
                      id={r.id}
                      status={r.status}
                      patientName={r.patientName}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
