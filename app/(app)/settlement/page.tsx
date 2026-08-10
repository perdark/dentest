import Link from "next/link";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { computeSettlement } from "@/lib/settlement";
import { currentPeriod, formatPeriodAr, todayISO } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { SettlementTable } from "./settlement-table";

/** "YYYY-MM" + عدد الأشهر -> "YYYY-MM" (محسوب محلياً، بلا تعديل ملفات مشتركة). */
function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function SettlementPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const period =
    sp.period && /^\d{4}-\d{2}$/.test(sp.period) ? sp.period : currentPeriod();

  const result = computeSettlement(period);
  const today = todayISO();
  const prev = shiftPeriod(period, -1);
  const next = shiftPeriod(period, 1);

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">الحصيلة الشهرية</h1>
            <p className="text-muted-foreground text-sm">
              توزيع المبالغ المُحصّلة وحصص الأطباء وصافي العيادة.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-11"
              render={<Link href={`?period=${prev}`} />}
            >
              <ChevronRight className="size-4" />
              السابق
            </Button>
            <span className="min-w-28 text-center text-sm font-semibold">
              {formatPeriodAr(period)}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-11"
              render={<Link href={`?period=${next}`} />}
            >
              التالي
              <ChevronLeft className="size-4" />
            </Button>
          </div>
        </div>

        {/* بانر بارز: الطبقة الثانية — الأرقام غير مؤكدة. */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <p className="leading-relaxed">
            النِّسَب وصيغة الحساب غير مؤكدة — تُراجع مع العيادة. الحالي: النسبة تُحسب
            على المبلغ المُحصَّل، وأجور المختبر مصروف عام للعيادة ولا تُخصم من الطبيب.
          </p>
        </div>
      </header>

      <SettlementTable key={period} result={result} period={period} today={today} />
    </div>
  );
}
