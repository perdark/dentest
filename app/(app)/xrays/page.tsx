import Link from "next/link";
import { ChevronRight, ChevronLeft, Scan } from "lucide-react";
import { listXrayTreatmentTypes, xrayFilmsForMonth } from "@/lib/queries";
import { formatIQD, formatNumber } from "@/lib/format";
import {
  formatDateShort,
  formatPeriodAr,
  currentPeriod,
  shiftPeriod,
  todayISO,
} from "@/lib/dates";
import { XRAY_PLACEMENT_LABELS } from "@/lib/strings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  const { rows, byType, count, internal, external, income } = xrayFilmsForMonth(period);
  const types = listXrayTreatmentTypes();

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

        {/* الصورة مدفوعة بتاريخها، فلا «قيمة» مقابل «محصَّل» ولا متبقٍ: رقم
            واحد هو دخل الشهر، وتحته تقسيمه داخل/خارج للمتابعة. */}
        <Card size="sm" className="bg-primary/5 ring-primary/30">
          <CardHeader>
            <CardDescription className="text-foreground">دخل الأشعة هذا الشهر</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="money text-lg font-bold sm:text-xl">{formatIQD(income)}</p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription>{XRAY_PLACEMENT_LABELS.internal}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="money text-lg font-bold sm:text-xl">{formatIQD(internal)}</p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription>{XRAY_PLACEMENT_LABELS.external}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="money text-lg font-bold sm:text-xl">{formatIQD(external)}</p>
          </CardContent>
        </Card>
      </section>

      <div data-tour="xrays-form">
        <XrayForm types={types} today={todayISO()} />
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
                <span>{filmCountAr(t.count)}</span>
                <span className="money text-base font-bold">{formatIQD(t.billed)}</span>
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
                  <TableHead>نوع الأشعة</TableHead>
                  <TableHead>داخل / خارج</TableHead>
                  <TableHead className="text-end">السعر</TableHead>
                  <TableHead className="w-px text-end">حذف</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">
                      <span dir="ltr" className="tabular-nums">
                        {formatDateShort(r.filmDate)}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{r.treatment}</TableCell>
                    <TableCell>
                      <Badge variant={r.placement === "internal" ? "default" : "secondary"}>
                        {XRAY_PLACEMENT_LABELS[r.placement] ?? r.placement}
                      </Badge>
                    </TableCell>
                    <TableCell className="money text-end text-lg font-bold">
                      {formatIQD(r.price)}
                    </TableCell>
                    <TableCell className="text-end">
                      <RemoveXrayButton
                        filmId={r.id}
                        treatment={r.treatment}
                        filmDate={r.filmDate}
                        price={r.price}
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
