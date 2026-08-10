import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { appointmentsForDate, appointmentCountsForDate, listDoctors } from "@/lib/queries";
import { todayISO, isValidISODate, formatDateAr } from "@/lib/dates";
import { APPT_STATUS_LABELS } from "@/lib/strings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import {
  BookAppointmentDialog,
  AppointmentActions,
} from "./appointment-forms";

export const metadata: Metadata = { title: "المواعيد" };

/** Shift a YYYY-MM-DD by N days using local time. */
function shiftISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return todayISO(dt);
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  booked: "outline",
  came: "default",
  no_show: "destructive",
};

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
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const date = sp.date && isValidISODate(sp.date) ? sp.date : todayISO();

  const rows = appointmentsForDate(date);
  const counts = appointmentCountsForDate(date);
  const doctors = listDoctors({ activeOnly: true }).map((d) => ({
    id: d.id,
    name: d.name,
  }));

  const prevDate = shiftISO(date, -1);
  const nextDate = shiftISO(date, 1);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">المواعيد</h1>
          <p className="text-muted-foreground text-sm">
            السجل الرئيسي — {formatDateAr(date)}
          </p>
        </div>
        <BookAppointmentDialog doctors={doctors} date={date} />
      </div>

      {/* تنقّل بين الأيام */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          className="h-11 gap-1"
          aria-label="اليوم السابق"
          render={<Link href={`/appointments?date=${prevDate}`} />}
        >
          <ChevronRight className="size-4" />
          السابق
        </Button>

        <form action="/appointments" className="flex items-center gap-2">
          <Input
            type="date"
            name="date"
            defaultValue={date}
            aria-label="اختر التاريخ"
            className="h-11 w-auto"
          />
          <Button type="submit" variant="outline" className="h-11">
            عرض
          </Button>
        </form>

        <Button
          variant="outline"
          className="h-11 gap-1"
          aria-label="اليوم التالي"
          render={<Link href={`/appointments?date=${nextDate}`} />}
        >
          التالي
          <ChevronLeft className="size-4" />
        </Button>
      </div>

      <section className="grid grid-cols-3 gap-3">
        <CountCard label="محجوز" value={counts.booked} />
        <CountCard label="حضر" value={counts.came} />
        <CountCard label="لم يحضر" value={counts.noShow} />
      </section>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            لا توجد مواعيد في هذا اليوم. اضغط «حجز موعد» لتسجيل أول موعد.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col divide-y px-0">
            {rows.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-(--card-spacing) py-3"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <Link
                    href={`/patients/${r.patientId}`}
                    className="text-primary font-medium underline-offset-4 hover:underline"
                  >
                    {r.patientName}
                  </Link>
                  <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>
                    {APPT_STATUS_LABELS[r.status] ?? r.status}
                  </Badge>
                  <span className="text-muted-foreground text-sm">
                    {r.doctorName ?? "بلا طبيب"}
                  </span>
                  {r.phone ? (
                    <a
                      href={`tel:${r.phone}`}
                      dir="ltr"
                      className="text-primary text-sm underline-offset-4 hover:underline"
                    >
                      {r.phone}
                    </a>
                  ) : null}
                  {r.note ? (
                    <span className="text-muted-foreground text-xs">· {r.note}</span>
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
    </div>
  );
}
