import Link from "next/link";
import { ChevronRight, ChevronLeft, Scan } from "lucide-react";
import {
  listDoctors,
  listXrayTreatmentTypes,
  searchPatients,
  xraysForMonth,
} from "@/lib/queries";
import { formatIQD, formatNumber } from "@/lib/format";
import {
  formatDateAr,
  formatPeriodAr,
  currentPeriod,
  shiftPeriod,
  todayISO,
} from "@/lib/dates";
import { medicalFlagsMarker } from "@/lib/strings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyValue } from "@/components/ui/empty-value";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { XrayForm } from "./xray-form";
import { RemoveXrayButton } from "./remove-xray-button";

/**
 * عدد الصور بصيغة عربية سليمة.
 *
 * «٣ صورة» خطأ يقرؤه كل موظف في العيادة: من ٣ إلى ١٠ يأتي جمع القِلّة «صور»،
 * وما فوقها يرجع إلى المفرد. رقم واحد بصيغة خاطئة يكفي ليبدو النظام مترجَماً.
 */
function filmCountAr(n: number): string {
  if (n === 1) return "صورة واحدة";
  if (n === 2) return "صورتان";
  if (n <= 10) return `${formatNumber(n)} صور`;
  return `${formatNumber(n)} صورة`;
}

export default async function XraysPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const period = sp.period && /^\d{4}-\d{2}$/.test(sp.period) ? sp.period : currentPeriod();
  const prev = shiftPeriod(period, -1);
  const next = shiftPeriod(period, 1);

  const { rows, byType, count, billed, outstanding, collected } = xraysForMonth(period);
  const doctors = listDoctors({ activeOnly: true });
  const types = listXrayTreatmentTypes();
  // أحدث المرضى يملأون القائمة قبل أول بحث — المراجع الجاي اليوم غالباً منهم.
  const recentPatients = searchPatients("", 20).map((p) => ({
    id: p.id,
    // نفس صيغة searchPatientsForXray — القائمة الأولى ونتائج البحث تُقرآن كواحدة.
    label:
      (p.phone ? `${p.fullName} · ${p.phone}` : p.fullName) +
      medicalFlagsMarker(p.medicalFlags),
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Scan className="text-muted-foreground size-6 shrink-0" />الأشعة</h1>
          <p className="text-muted-foreground text-sm">
            صور الأشعة المسجّلة ودخلها — دخل العيادة، خارج حصص الأطباء.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-11"
            nativeButton={false}
            render={<Link href={`?period=${prev}`} />}
          >
            <ChevronRight className="size-4" />
            الشهر السابق
          </Button>
          <span className="min-w-28 text-center text-sm font-semibold">
            {formatPeriodAr(period)}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-11"
            nativeButton={false}
            render={<Link href={`?period=${next}`} />}
          >
            الشهر التالي
            <ChevronLeft className="size-4" />
          </Button>
        </div>
      </header>

      {/* ملخص الشهر: العدد والقيمة والمحصّل والمتبقي. */}
      <section
        data-tour="xrays-totals"
        className="animate-stagger grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <Card size="sm">
          <CardHeader>
            <CardDescription>عدد الصور</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="money text-lg font-bold sm:text-xl">{formatNumber(count)}</p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription>قيمة الأشعة</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="money text-lg font-bold sm:text-xl">{formatIQD(billed)}</p>
          </CardContent>
        </Card>

        <Card size="sm" className="bg-primary/5 ring-primary/30">
          <CardHeader>
            <CardDescription className="text-foreground">المحصّل خلال الشهر</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="money text-lg font-bold sm:text-xl">{formatIQD(collected)}</p>
            <p className="text-muted-foreground text-xs">
              كل ما استلمته العيادة هذا الشهر عن الأشعة، ولو كانت الصورة من شهر سابق.
            </p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription>المتبقي على صور الشهر</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="money text-lg font-bold sm:text-xl">{formatIQD(outstanding)}</p>
          </CardContent>
        </Card>
      </section>

      <div data-tour="xrays-form">
        <XrayForm
          doctors={doctors}
          types={types}
          today={todayISO()}
          recentPatients={recentPatients}
        />
      </div>

      {/* حسب النوع — يظهر فقط حين يكون في الشهر ما يُقسَّم. */}
      {byType.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">حسب النوع</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-x-6 gap-y-2">
            {byType.map((t) => (
              <div key={t.key} className="flex items-baseline gap-2 text-sm">
                <span className="font-medium">{t.nameAr}</span>
                <span className="text-muted-foreground">{filmCountAr(t.count)}</span>
                <span className="money font-semibold">{formatIQD(t.billed)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* سجل الشهر */}
      <Card data-tour="xrays-list">
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <p className="text-muted-foreground px-4 py-8 text-center text-sm">
              لا توجد أشعة مُسجّلة في {formatPeriodAr(period)}.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>المريض</TableHead>
                  <TableHead>نوع الأشعة</TableHead>
                  <TableHead>الطبيب</TableHead>
                  <TableHead className="text-end">القيمة</TableHead>
                  <TableHead className="text-end">المدفوع</TableHead>
                  <TableHead className="text-end">المتبقي</TableHead>
                  <TableHead className="w-px text-end">حذف</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDateAr(r.openedDate)}
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/patients/${r.patientId}`} className="hover:underline">
                        {r.patientName}
                      </Link>
                    </TableCell>
                    <TableCell>{r.treatment}</TableCell>
                    <TableCell className="text-muted-foreground">{r.doctorName}</TableCell>
                    <TableCell className="money text-end">{formatIQD(r.totalPrice)}</TableCell>
                    <TableCell className="money text-end">{formatIQD(r.paid)}</TableCell>
                    <TableCell className="money text-end">
                      {r.remaining > 0 ? (
                        <span className="font-semibold">{formatIQD(r.remaining)}</span>
                      ) : (
                        <EmptyValue>مسدَّد</EmptyValue>
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      <RemoveXrayButton
                        caseId={r.id}
                        patientName={r.patientName}
                        treatment={r.treatment}
                        openedDate={r.openedDate}
                        paid={r.paid}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
