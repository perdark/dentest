import Link from "next/link";
import { ChevronLeft, ChevronRight, Calculator } from "lucide-react";
import { computeSettlement } from "@/lib/settlement";
import { labDuesTotal } from "@/lib/queries";
import { formatIQD } from "@/lib/format";
import { currentPeriod, formatPeriodAr, shiftPeriod, todayISO } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { SettlementTable } from "./settlement-table";


export default async function SettlementPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const period =
    sp.period && /^\d{4}-\d{2}$/.test(sp.period) ? sp.period : currentPeriod();

  const result = computeSettlement(period);
  const labDues = labDuesTotal(period);
  const today = todayISO();
  const prev = shiftPeriod(period, -1);
  const next = shiftPeriod(period, 1);

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold"><Calculator className="text-muted-foreground size-6 shrink-0" />الحصيلة الشهرية</h1>
            <p className="text-muted-foreground text-sm">
              توزيع المبالغ المُحصّلة وحصص الأطباء وصافي العيادة.
            </p>
          </div>
          <div data-tour="settlement-period" className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-11"
              nativeButton={false}
              render={<Link href={`?period=${prev}`} />}
            >
              <ChevronRight className="size-4" />
              السابق
            </Button>
            <span className="min-w-28 text-center text-base font-semibold">
              {formatPeriodAr(period)}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-11"
              nativeButton={false}
              render={<Link href={`?period=${next}`} />}
            >
              التالي
              <ChevronLeft className="size-4" />
            </Button>
          </div>
        </div>

        {/* قاعدة الاحتساب مكتوبة للعيادة، لا تحذير: من يقرأ الجدول يحتاج أن
            يعرف على أي أساس خرجت الأرقام. تتبع ما هو مضبوط في «الإعدادات». */}
        <p className="bg-muted/40 rounded-lg px-3 py-2.5 text-sm leading-relaxed">
          طريقة الاحتساب الحالية: النسبة تُحسب على المبلغ المُحصَّل، وأجور المختبر
          مصروف عام للعيادة ولا تُخصم من الطبيب. تُغيَّر من «الإعدادات».
        </p>

        {/* سطر تعريفي فقط: مستحقات المختبر خارج الحصص تماماً، ويُقرأ تفصيلها في
            صفحة كل طبيب. لا يدخل أي رقم منه في الجدول أدناه. [2026-08-19] */}
        {labDues !== 0 ? (
          <p className="rounded-lg border px-3 py-2.5 text-sm leading-relaxed">
            مستحقات المختبرات هذا الشهر{" "}
            <span className="money text-lg font-bold">{formatIQD(labDues)}</span>{" "}
            — تتبّع خارج الحصص: متابعة بين كل طبيب ومختبره، لا تُخصم من حصة أي
            طبيب ولا من صندوق العيادة. تفصيلها في صفحة «الأطباء».
          </p>
        ) : null}
      </header>

      <div data-tour="settlement-table">
        <SettlementTable key={period} result={result} period={period} today={today} />
      </div>
    </div>
  );
}
