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

/**
 * `hero` is for the one figure the owner opens the laptop to read. Seven cards
 * at identical weight force him to read all seven every morning; one dominant
 * number and two supporting rows let him read only what changed.
 */
function StatCard({
  label,
  value,
  amber = false,
  outflow = false,
  note,
  hero = false,
}: {
  label: string;
  value: string;
  /** تنبيه: تجاوز حد الاحتياطي النقدي — يصبغ البطاقة كلها. */
  amber?: boolean;
  /**
   * رقم موجب لكنه **يخرج** من العيادة (مصروفات، حصص).
   * ⚠️ منفصل عن `amber` عمداً: ذاك تنبيه على حالة، وهذا وصف اتجاه. خلطهما
   * يعني إن كل مصروف يقرا كإنذار احتياطي.
   * ⚠️ ومنفصل عن `text-destructive`: الأحمر محجوز للمبالغ السالبة فعلاً
   * (HANDOFF §1) — صبغ مصروف طبيعي بالأحمر هو نفس الغلط اللي انشال عن
   * «الديون».
   */
  outflow?: boolean;
  note?: string;
  hero?: boolean;
}) {
  return (
    <Card
      size="sm"
      className={cn(amber && "bg-amber-50 ring-amber-500/40 dark:bg-amber-950/30")}
    >
      <CardHeader>
        <CardDescription
          className={cn(
            hero && "text-base font-medium",
            amber && "text-amber-900 dark:text-amber-200",
          )}
        >
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <p
          className={cn(
            "money font-bold",
            hero ? "text-3xl sm:text-5xl" : "text-xl sm:text-2xl",
            amber && "text-amber-900 dark:text-amber-100",
            !amber && outflow && "text-amber-700 dark:text-amber-500",
          )}
        >
          {/* الإشارة عرض فقط — الرقم بالقاعدة موجب، ونفيه يكسر كل مجموع. */}
          {outflow ? `− ${value}` : value}
        </p>
        {note ? (
          <p
            className={cn(
              "text-sm",
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-muted-foreground text-sm font-semibold">{children}</h2>
  );
}

export default function DashboardPage() {
  const stats = dashboardStats();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><LayoutDashboard className="text-muted-foreground size-6 shrink-0" />ملخص {formatPeriodAr(stats.period)}</h1>
      </header>

      {/* النقد المتوفر أولاً ووحده: هو أول سؤال يُسأل كل صباح. ثم «اليوم» ثم «الشهر». */}
      <section data-tour="stats" className="animate-stagger flex flex-col gap-5">
        <StatCard
          hero
          label="النقد المتوفر"
          value={formatIQD(stats.cash)}
        />

        <div className="flex flex-col gap-2">
          <SectionLabel>اليوم</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="تحصيل اليوم" value={formatIQD(stats.todayCollected)} />
            <StatCard
              label="مواعيد اليوم"
              value={formatNumber(stats.apptToday.total)}
              note={
                stats.apptToday.total > 0
                  ? `حضر ${formatNumber(stats.apptToday.came)} · بانتظار ${formatNumber(stats.apptToday.booked)}`
                  : undefined
              }
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <SectionLabel>هذا الشهر</SectionLabel>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="تحصيل هذا الشهر" value={formatIQD(stats.monthCollected)} />
            <StatCard label="مصروفات هذا الشهر" value={formatIQD(stats.monthExpenses)} outflow />
            <StatCard label="إجمالي الديون" value={formatIQD(stats.outstanding)} />
            <StatCard label="كروت زراعة مفتوحة" value={formatNumber(stats.openImplants)} />
          </div>
        </div>
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
                    <TableCell className="money text-end text-base font-semibold">
                      {formatIQD(d.collected)}
                    </TableCell>
                  </TableRow>
                ))}
                {stats.monthXray !== 0 ? (
                  /* دخل العيادة لا حصة طبيب — يُميَّز بخلفية لا بتخفيت الرقم. [D9] */
                  <TableRow className="bg-muted/40">
                    <TableCell className="font-medium">
                      الأشعة
                      <span className="text-muted-foreground ms-1 font-normal">
                        (دخل العيادة، لا يُضاف لأي طبيب)
                      </span>
                    </TableCell>
                    <TableCell className="money text-end font-medium">
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
          تسجيل اليوم
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
