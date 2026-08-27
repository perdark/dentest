import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, Stethoscope } from "lucide-react";
import { computeSettlement } from "@/lib/settlement";
import { labDuesForPeriod } from "@/lib/queries";
import { currentPeriod, formatPeriodAr, shiftPeriod } from "@/lib/dates";
import { formatIQD } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AddDoctorDialog, DeleteDoctor } from "./doctor-forms";
import { AllLabsCard } from "./all-labs-card";

export const metadata: Metadata = { title: "الأطباء" };

export default async function DoctorsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const period =
    sp.period && /^\d{4}-\d{2}$/.test(sp.period) ? sp.period : currentPeriod();

  // الحصيلة تُحسب مرة واحدة هنا وتُقرأ لكل طبيب — الصيغة تعيش في lib/settlement
  // ولا تُعاد كتابتها في أي شاشة. [قاعدة ذهبية]
  const result = computeSettlement(period);
  const labDues = labDuesForPeriod(period);

  const prev = shiftPeriod(period, -1);
  const next = shiftPeriod(period, 1);

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Stethoscope className="text-muted-foreground size-6 shrink-0" />
            <div>
              <h1 className="text-2xl font-bold">الأطباء</h1>
              <p className="text-muted-foreground text-sm">
                ما يُصرف لكل طبيب هذا الشهر، ومستحقات مختبره.
              </p>
            </div>
          </div>
          <AddDoctorDialog />
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

        {/* اتجاه المال مكتوب صراحةً: «المستحق للطبيب» مالٌ تدفعه العيادة له، لا
            مالٌ عليه. ومستحقات المختبر تتبّع لا خصم — تُكتب هنا حتى لا تُقرأ
            على أنها اقتُطعت من حصته. */}
        <p className="bg-muted/40 rounded-lg px-3 py-2.5 text-sm leading-relaxed">
          «المستحق للطبيب» هو حصته من العيادة عن هذا الشهر، وهو المبلغ الذي
          تدفعه له العيادة. «مستحقات المختبر» متابعة فقط بين الطبيب ومختبره —
          لا تدخل حصته ولا صندوق العيادة، ولا تُخصم من المستحق له.
        </p>
      </header>

      <section data-tour="doctors-list" className="grid gap-3 sm:grid-cols-2">
        {result.doctors.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center sm:col-span-2">
            <Stethoscope className="size-10 shrink-0 opacity-40" />
            <p className="text-sm">لا يوجد أطباء بعد — أضف طبيباً للبدء.</p>
          </div>
        ) : null}
        {result.doctors.map((d) => {
          const lab = labDues.get(d.doctorId) ?? { fixed: 0, mobile: 0, total: 0 };
          return (
            <Card key={d.doctorId}>
              <CardContent className="flex flex-col gap-3 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/doctors/${d.doctorId}?period=${period}`}
                    className="text-primary inline-flex min-h-11 items-center text-lg font-semibold underline-offset-4 hover:underline"
                  >
                    {d.doctorName}
                  </Link>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm">
                      النسبة{" "}
                      <span className="text-foreground font-semibold tabular-nums">
                        {d.commissionPct}%
                      </span>
                    </span>
                    {d.isOwner ? <Badge variant="secondary">المالك</Badge> : null}
                    {/* ⚠️ المالك ما ينحذف من هنا إطلاقاً: حذفه يقطع كل بوابات
                        `isOwner` بالتطبيق (12 موضع) ويترك العيادة بلا صاحب
                        صلاحية. الخادم يرفضه كذلك لأن عنده سجلات، بس إخفاء الزر
                        يمنع السؤال من الأساس. */}
                    {d.isOwner ? null : (
                      <DeleteDoctor id={d.doctorId} name={d.doctorName} />
                    )}
                  </div>
                </div>

                {/* السبب الوحيد لفتح هذه البطاقة: كم يُدفع لهذا الطبيب. الرقم
                    يسبق كل ما عداه حجماً ووزناً، وأرقام المختبر تحته تابعة له. */}
                <div className="border-primary/30 bg-primary/5 rounded-lg border px-3 py-2.5">
                  <p className="text-muted-foreground text-sm">
                    المستحق للطبيب — حصة هذا الشهر
                  </p>
                  <p className="money text-2xl font-bold">{formatIQD(d.payout)}</p>
                </div>

                <dl className="grid gap-1.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">
                      مستحقات المختبر (ثابت)
                    </dt>
                    <dd className="money font-semibold">{formatIQD(lab.fixed)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">
                      مستحقات المختبر (متحرك)
                    </dt>
                    <dd className="money font-semibold">{formatIQD(lab.mobile)}</dd>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 border-t pt-1.5">
                    <dt className="text-muted-foreground">
                      الصافي بعد المختبر
                    </dt>
                    <dd className="money font-semibold">
                      {formatIQD(d.payout - lab.total)}
                    </dd>
                  </div>
                </dl>

                <p className="text-muted-foreground text-sm">
                  أرقام المختبر متابعة فقط ولا تُخصم من المستحق للطبيب أعلاه.
                </p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* دفتر المختبرات كلها — مجموعاً في مكان واحد أسفل بطاقات الأطباء، وخارج
          حسابات العيادة تماماً. [قرار العيادة 2026-08-25] */}
      <AllLabsCard period={period} />
    </div>
  );
}
