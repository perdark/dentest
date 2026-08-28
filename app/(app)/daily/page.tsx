import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarDays, StickyNote } from "lucide-react";
import {
  collectableCaseCount,
  dailyLedger,
  listDoctors,
  listTreatmentTypes,
  openCasesBrief,
  xrayFilmsForDate,
} from "@/lib/queries";
import { todayISO, isValidISODate, formatDateAr } from "@/lib/dates";
import { formatIQD } from "@/lib/format";
import {
  medicalFlagsMarker,
  PAYMENT_KIND_LABELS,
  XRAY_BUCKET,
  XRAY_PLACEMENT_LABELS,
} from "@/lib/strings";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DayPicker } from "@/components/forms/day-picker";
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
  // الأشعة لا دفعات لها: الفيلم مدفوع بتاريخه، فيُقرأ من سجله ويدخل إجمالي
  // اليوم كي يطابق الدفتر ما في الدرج. [قرار العيادة 2026-08-25][D9]
  const films = xrayFilmsForDate(date);
  const filmsTotal = films.reduce((s, f) => s + f.price, 0);
  const doctors = listDoctors({ activeOnly: true });
  // الأشعة لها سجلها الخاص، ودخلها للعيادة لا للطبيب — فلا تُفتح من هنا. [D9]
  const treatments = listTreatmentTypes().filter(
    (t) => !t.isImplant && !t.isOrtho && t.settlementBucket !== XRAY_BUCKET,
  );
  // Capped list — the dialog searches the server for anything beyond it. [D3]
  const openCases = openCasesBrief().map((c) => ({
    id: c.id,
    // نفس صيغة نتائج البحث في searchCollectableCases — القائمتان تُقرآن كواحدة.
    label:
      `${c.patientName} · ${c.treatment} · متبقٍ ${formatIQD(c.remaining)}` +
      medicalFlagsMarker(c.patientMedicalFlags),
    remaining: c.remaining,
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
  const grandTotal = rows.reduce((s, r) => s + r.amount, 0) + filmsTotal;
  const prevDate = shiftISO(date, -1);
  const nextDate = shiftISO(date, 1);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><CalendarDays className="text-muted-foreground size-6 shrink-0" />الدفتر اليومي</h1>
          <p className="text-base font-medium">{formatDateAr(date)}</p>
        </div>
        <div data-tour="daily-add">
          <EntryDialog
            doctors={doctors}
            treatments={treatments}
            date={date}
            openCases={openCases}
            totalCollectable={totalCollectable}
          />
        </div>
      </div>

      {/* Day navigation */}
      <div data-tour="daily-nav" className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          className="h-11 gap-1"
          aria-label="اليوم السابق"
          nativeButton={false}
          render={<Link href={`/daily?date=${prevDate}`} />}
        >
          <ChevronRight className="size-4" />
          السابق
        </Button>

        <DayPicker basePath="/daily" date={date} label="اختر يوم الدفتر" />

        <Button
          variant="outline"
          className="h-11 gap-1"
          aria-label="اليوم التالي"
          nativeButton={false}
          render={<Link href={`/daily?date=${nextDate}`} />}
        >
          التالي
          <ChevronLeft className="size-4" />
        </Button>
      </div>

      {/* Ledger */}
      {rows.length === 0 && films.length === 0 ? (
        <Card data-tour="daily-ledger">
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            لا توجد تسجيلات في هذا اليوم. اضغط «تسجيل جديد» لإضافة أول دفعة.
          </CardContent>
        </Card>
      ) : (
        <div data-tour="daily-ledger" className="animate-stagger flex flex-col gap-4">
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
                      <span>{line.treatment}</span>
                      <Badge variant={kindVariant(line.kind)}>
                        {PAYMENT_KIND_LABELS[line.kind] ?? line.kind}
                      </Badge>
                      {line.implantCardNo != null ? (
                        <span className="text-sm">
                          بطاقة #
                          <span className="font-medium tabular-nums">
                            {line.implantCardNo}
                          </span>
                        </span>
                      ) : null}
                      {/* الدفتر مجموعٌ بالطبيب، و«مجموع الطبيب» أسفله نقدُ اليوم
                          لا أساس حصته. الأشعة وحدها تختلف بين الرقمين، فتُعلَّم
                          هنا كي لا يُقرأ سطرها كعمل يُحتسب له. [D9] */}
                      {line.bucket === XRAY_BUCKET ? (
                        <span className="text-sm font-medium">دخل العيادة</span>
                      ) : null}
                      {/* ملاحظة الدفعة تُقرأ من السطر نفسه — كانت محفوظة ولا تُعرض
                          في أي شاشة. النص الكامل يظهر عند المرور. */}
                      {line.note?.trim() ? (
                        <span
                          title={line.note}
                          className="inline-flex min-w-0 max-w-64 items-center gap-1.5 text-sm"
                        >
                          <StickyNote className="text-muted-foreground size-4 shrink-0" />
                          <span className="truncate">{line.note}</span>
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
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">مجموع الطبيب</span>
                  <span
                    className={cn(
                      "money text-base font-bold tabular-nums",
                      g.subtotal < 0 && "text-destructive",
                    )}
                  >
                    {formatIQD(g.subtotal)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* الأشعة — بلا طبيب وبلا اسم، فلها بطاقتها لا مجموعة طبيب. [D9] */}
          {films.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  الأشعة
                  <span className="text-muted-foreground text-sm font-normal">
                    دخل العيادة
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col">
                {films.map((f) => (
                  <div
                    key={f.id}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-medium">{f.treatment}</span>
                      <Badge variant="outline">
                        {XRAY_PLACEMENT_LABELS[f.placement] ?? f.placement}
                      </Badge>
                    </div>
                    <span className="money shrink-0 font-semibold tabular-nums">
                      {formatIQD(f.price)}
                    </span>
                  </div>
                ))}

                <Separator className="my-2" />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">مجموع الأشعة</span>
                  <span className="money text-base font-bold tabular-nums">
                    {formatIQD(filmsTotal)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Grand total */}
          <Card>
            <CardContent className="flex items-center justify-between py-4">
              <span className="text-base font-semibold">إجمالي اليوم</span>
              <span
                className={cn(
                  "money text-2xl font-bold tabular-nums",
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
