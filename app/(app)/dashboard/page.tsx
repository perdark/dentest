import Link from "next/link";
import { ArrowLeft, LayoutDashboard } from "lucide-react";
import { dashboardStats } from "@/lib/queries";
import { formatIQD, formatNumber } from "@/lib/format";
import { formatPeriodAr } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function StatCard({
  label,
  value,
  amber = false,
  note,
}: {
  label: string;
  value: string;
  amber?: boolean;
  note?: string;
}) {
  return (
    <Card
      size="sm"
      className={cn(amber && "bg-amber-50 ring-amber-500/40 dark:bg-amber-950/30")}
    >
      <CardHeader>
        <CardDescription
          className={cn(amber && "text-amber-900 dark:text-amber-200")}
        >
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <p
          className={cn(
            "money text-xl font-bold sm:text-2xl",
            amber && "text-amber-900 dark:text-amber-100",
          )}
        >
          {value}
        </p>
        {note ? (
          <p
            className={cn(
              "text-xs",
              amber
                ? "text-amber-700 dark:text-amber-300"
                : "text-muted-foreground",
            )}
          >
            {note}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const stats = dashboardStats();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><LayoutDashboard className="text-muted-foreground size-6 shrink-0" />ملخص {formatPeriodAr(stats.period)}</h1>
      </header>

      <section
        data-tour="stats"
        className="animate-stagger grid grid-cols-2 gap-3 lg:grid-cols-3"
      >
        <StatCard
          label="النقد المتوفر"
          value={formatIQD(stats.cash)}
          amber={stats.overReserve}
          note={
            stats.overReserve
              ? `أعلى من حد الاحتياطي (${formatIQD(stats.reserveThreshold)})`
              : undefined
          }
        />
        <StatCard label="تحصيل اليوم" value={formatIQD(stats.todayCollected)} />
        <StatCard label="تحصيل هذا الشهر" value={formatIQD(stats.monthCollected)} />
        <StatCard label="مصروفات هذا الشهر" value={formatIQD(stats.monthExpenses)} />
        <StatCard label="إجمالي الديون" value={formatIQD(stats.outstanding)} />
        <StatCard label="كروت زراعة مفتوحة" value={formatNumber(stats.openImplants)} />
        <StatCard
          label="مواعيد اليوم"
          value={formatNumber(stats.apptToday.total)}
          note={
            stats.apptToday.total > 0
              ? `حضر ${formatNumber(stats.apptToday.came)} · بانتظار ${formatNumber(stats.apptToday.booked)}`
              : undefined
          }
        />
      </section>

      <Card data-tour="doctor-collections">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>تحصيل الأطباء هذا الشهر</CardTitle>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0"
            nativeButton={false}
            render={<Link href="/settlement" />}
          >
            الحصيلة الشهرية
            <ArrowLeft className="size-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {/* الجدول مبنيّ على الأطباء لا على الدفعات، فالصفوف موجودة دائماً —
              الحالة الفارغة الحقيقية هي ألّا يوجد تحصيل. [D7]
              دخل الأشعة سطر مستقل: هو من تحصيل الشهر لكنه للعيادة، فلا يُضاف
              إلى أي طبيب. [D9] */}
          {stats.perDoctorMonth.every((d) => d.collected === 0) && stats.monthXray === 0 ? (
            <p className="text-muted-foreground py-4 text-sm">
              لا يوجد تحصيل لهذا الشهر بعد.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الطبيب</TableHead>
                  <TableHead className="text-end">المحصّل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.perDoctorMonth.map((d) => (
                  <TableRow key={d.doctorId}>
                    <TableCell className="font-medium">{d.doctorName}</TableCell>
                    <TableCell className="money text-end">
                      {formatIQD(d.collected)}
                    </TableCell>
                  </TableRow>
                ))}
                {stats.monthXray !== 0 ? (
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">
                      الأشعة (دخل العيادة)
                    </TableCell>
                    <TableCell className="money text-muted-foreground text-end">
                      {formatIQD(stats.monthXray)}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <section
        data-tour="quick-actions"
        className="animate-stagger flex flex-col gap-3 sm:flex-row"
      >
        <Button
          size="lg"
          className="h-11 w-full sm:w-auto"
          nativeButton={false}
          render={<Link href="/daily" />}
        >
          إضافة قيد اليوم
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-11 w-full sm:w-auto"
          nativeButton={false}
          render={<Link href="/appointments" />}
        >
          مواعيد اليوم
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-11 w-full sm:w-auto"
          nativeButton={false}
          render={<Link href="/debts" />}
        >
          الديون
        </Button>
      </section>
    </div>
  );
}
