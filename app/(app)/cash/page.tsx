import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { cashMovementsForMonth } from "@/lib/queries";
import { cashOnHand, getSettings } from "@/lib/server-utils";
import { formatIQD } from "@/lib/format";
import { formatDateAr, formatPeriodAr, todayISO, currentPeriod } from "@/lib/dates";
import { CASH_MOVE_LABELS } from "@/lib/strings";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CashForm } from "./cash-form";

export const metadata: Metadata = { title: "الحركات النقدية" };

/** "YYYY-MM" + عدد الأشهر -> "YYYY-MM". */
function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            "money text-xl font-bold tabular-nums sm:text-2xl",
            tone === "negative" && "text-destructive",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const period =
    sp.period && /^\d{4}-\d{2}$/.test(sp.period) ? sp.period : currentPeriod();
  const prev = shiftPeriod(period, -1);
  const next = shiftPeriod(period, 1);

  const { rows, inflow, outflow, net } = cashMovementsForMonth(period);
  const settings = getSettings();
  const cash = cashOnHand();
  const overReserve = cash > settings.cashReserveThreshold;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">الحركات النقدية</h1>
          <p className="text-muted-foreground text-sm">
            كل حركة نقد غير مرتبطة بدفعة مريض — احتياطي، سحب، سحب المالك، وصرف
            حصص الأطباء.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-11" render={<Link href={`?period=${prev}`} />}>
            <ChevronRight className="size-4" />
            الشهر السابق
          </Button>
          <span className="min-w-28 text-center text-sm font-semibold">
            {formatPeriodAr(period)}
          </span>
          <Button variant="outline" size="sm" className="h-11" render={<Link href={`?period=${next}`} />}>
            الشهر التالي
            <ChevronLeft className="size-4" />
          </Button>
        </div>
      </header>

      {/* قاعدة الاحتياطي — الرقم غير مؤكد ويُراجع مع العيادة. */}
      {overReserve ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <p className="leading-relaxed">
            النقد المتوفر <span className="money">{formatIQD(cash)}</span> تجاوز حد
            الاحتياطي <span className="money">{formatIQD(settings.cashReserveThreshold)}</span>{" "}
            (رقم غير مؤكد — يُراجع مع العيادة). سجّلي حركة «احتياطي» خارجة عند
            تنحية المبلغ من الصندوق.
          </p>
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label="النقد المتوفر الآن" value={formatIQD(cash)} />
        <Figure label="داخل هذا الشهر" value={formatIQD(inflow)} />
        <Figure label="خارج هذا الشهر" value={formatIQD(outflow)} tone="negative" />
        <Figure
          label="صافي الحركات"
          value={formatIQD(net)}
          tone={net < 0 ? "negative" : undefined}
        />
      </section>

      <CashForm today={todayISO()} />

      <Card>
        <CardHeader>
          <CardDescription>حركات {formatPeriodAr(period)}</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm">
              لا توجد حركات نقدية في هذا الشهر.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="ps-(--card-spacing)">التاريخ</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>ملاحظة</TableHead>
                  <TableHead className="pe-(--card-spacing) text-end">المبلغ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="ps-(--card-spacing) whitespace-nowrap">
                      {formatDateAr(r.moveDate)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.type === "payout" ? "secondary" : "outline"}>
                        {CASH_MOVE_LABELS[r.type] ?? r.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.note || "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "money pe-(--card-spacing) text-end font-semibold tabular-nums",
                        r.amount < 0 && "text-destructive",
                      )}
                    >
                      {formatIQD(r.amount)}
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
