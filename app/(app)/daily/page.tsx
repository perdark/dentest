import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  collectableCaseCount,
  dailyLedger,
  listDoctors,
  listTreatmentTypes,
  openCasesBrief,
} from "@/lib/queries";
import { todayISO, isValidISODate, formatDateAr } from "@/lib/dates";
import { formatIQD } from "@/lib/format";
import { PAYMENT_KIND_LABELS } from "@/lib/strings";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { VoidPaymentButton } from "@/components/forms/void-payment-button";
import { EntryDialog } from "./entry-dialog";

/** Shift a YYYY-MM-DD by N days using local time. */
function shiftISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return todayISO(dt);
}

type LedgerRow = ReturnType<typeof dailyLedger>[number];

function kindVariant(kind: string): "destructive" | "secondary" | "outline" {
  if (kind === "refund") return "destructive";
  if (kind === "down_payment") return "secondary";
  return "outline";
}

export default async function DailyPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const date = sp.date && isValidISODate(sp.date) ? sp.date : todayISO();

  const rows = dailyLedger(date);
  const doctors = listDoctors({ activeOnly: true });
  const treatments = listTreatmentTypes().filter((t) => !t.isImplant && !t.isOrtho);
  // Capped list — the dialog searches the server for anything beyond it. [D3]
  const openCases = openCasesBrief().map((c) => ({
    id: c.id,
    label: `${c.patientName} · ${c.treatment} · متبقٍ ${formatIQD(c.remaining)}`,
  }));
  const totalCollectable = collectableCaseCount();

  // Group ledger lines by doctor (rows already sorted by doctor sortOrder).
  const groups = new Map<
    number,
    { doctorId: number; doctorName: string; lines: LedgerRow[]; subtotal: number }
  >();
  for (const r of rows) {
    let g = groups.get(r.doctorId);
    if (!g) {
      g = { doctorId: r.doctorId, doctorName: r.doctorName, lines: [], subtotal: 0 };
      groups.set(r.doctorId, g);
    }
    g.lines.push(r);
    g.subtotal += r.amount;
  }
  const grandTotal = rows.reduce((s, r) => s + r.amount, 0);
  const prevDate = shiftISO(date, -1);
  const nextDate = shiftISO(date, 1);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">الدفتر اليومي</h1>
          <p className="text-muted-foreground text-sm">{formatDateAr(date)}</p>
        </div>
        <EntryDialog
          doctors={doctors}
          treatments={treatments}
          date={date}
          openCases={openCases}
          totalCollectable={totalCollectable}
        />
      </div>

      {/* Day navigation */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          className="h-11 gap-1"
          aria-label="اليوم السابق"
          render={<Link href={`/daily?date=${prevDate}`} />}
        >
          <ChevronRight className="size-4" />
          السابق
        </Button>

        <form action="/daily" className="flex items-center gap-2">
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
          render={<Link href={`/daily?date=${nextDate}`} />}
        >
          التالي
          <ChevronLeft className="size-4" />
        </Button>
      </div>

      {/* Ledger */}
      {rows.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            لا توجد قيود في هذا اليوم. اضغط «إضافة قيد» لتسجيل أول دفعة.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {[...groups.values()].map((g) => (
            <Card key={g.doctorId}>
              <CardHeader>
                <CardTitle>{g.doctorName}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col">
                {g.lines.map((line) => (
                  <div
                    key={line.paymentId}
                    className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b py-2 last:border-b-0"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{line.patientName}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">{line.treatment}</span>
                      <Badge variant={kindVariant(line.kind)}>
                        {PAYMENT_KIND_LABELS[line.kind] ?? line.kind}
                      </Badge>
                      {line.implantCardNo != null ? (
                        <span className="text-muted-foreground text-xs">
                          بطاقة #{line.implantCardNo}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span
                        className={cn(
                          "money font-semibold tabular-nums",
                          line.amount < 0 && "text-destructive",
                        )}
                      >
                        {formatIQD(line.amount)}
                      </span>
                      <VoidPaymentButton
                        paymentId={line.paymentId}
                        amount={line.amount}
                        paidDate={date}
                        patientName={line.patientName}
                      />
                    </div>
                  </div>
                ))}

                <Separator className="my-2" />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">مجموع الطبيب</span>
                  <span
                    className={cn(
                      "money font-semibold tabular-nums",
                      g.subtotal < 0 && "text-destructive",
                    )}
                  >
                    {formatIQD(g.subtotal)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Grand total */}
          <Card>
            <CardContent className="flex items-center justify-between py-4">
              <span className="text-base font-semibold">إجمالي اليوم</span>
              <span
                className={cn(
                  "money text-lg font-bold tabular-nums",
                  grandTotal < 0 && "text-destructive",
                )}
              >
                {formatIQD(grandTotal)}
              </span>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
