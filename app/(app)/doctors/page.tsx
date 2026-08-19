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
import { AddDoctorDialog } from "./doctor-forms";

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
                حصة كل طبيب من العيادة، ومستحقات مختبره.
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
            التالي
            <ChevronLeft className="size-4" />
          </Button>
        </div>

        {/* مستحقات المختبر تتبّع لا صرف — تُكتب هنا صراحةً حتى لا تُقرأ خصماً. */}
        <p className="text-muted-foreground bg-muted/40 rounded-lg px-3 py-2.5 text-sm leading-relaxed">
          «مستحقات العيادة» هي حصة الطبيب التي تُصرف له. «مستحقات المختبر» متابعة
          فقط بين الطبيب ومختبره — لا تدخل الحصة ولا صندوق العيادة.
        </p>
      </header>

      <section data-tour="doctors-list" className="grid gap-3 sm:grid-cols-2">
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
                  {d.isOwner ? <Badge variant="secondary">المالك</Badge> : null}
                </div>

                <dl className="grid gap-1.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">مستحقات العيادة</dt>
                    <dd className="money font-semibold">{formatIQD(d.payout)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">
                      مستحقات المختبر (ثابت)
                    </dt>
                    <dd className="money">{formatIQD(lab.fixed)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">
                      مستحقات المختبر (متحرك)
                    </dt>
                    <dd className="money">{formatIQD(lab.mobile)}</dd>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 border-t pt-1.5">
                    <dt className="text-muted-foreground">الصافي (للعلم)</dt>
                    <dd className="money text-foreground font-semibold">
                      {formatIQD(d.payout - lab.total)}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
