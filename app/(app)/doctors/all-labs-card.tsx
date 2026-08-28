import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { labDuesForPeriod, labEntriesForPeriod, listDoctors } from "@/lib/queries";
import { formatDateShort, formatPeriodAr } from "@/lib/dates";
import { formatIQD } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyValue } from "@/components/ui/empty-value";
import { LAB_BRANCH_LABELS } from "@/lib/strings";

/**
 * دفتر المختبرات كلها — أسفل صفحة «الأطباء». [قرار العيادة 2026-08-25]
 *
 * مختبر كل طبيب حسابٌ بينه وبين مختبره، لكن المالك (د. عدي) هو من يمسك الدفتر،
 * فيحتاج الأرقام مجموعةً في مكان واحد: خلاصة لكل طبيب، ثم كل قيد بتفصيله.
 * مكانها الشاشة التي يُفتح منها كل شيء عن الأطباء، لا ملف طبيب بعينه.
 *
 * **هذا المال خارج حسابات العيادة تماماً**: لا يدخل «سجل الصرفيات»، ولا صافي
 * العيادة، ولا النقد المتوفر، ولا حصة أي طبيب. لذلك تُقرأ الأرقام هنا من
 * `lab_entries` وحدها ولا تُجمع مع أي رقم من أرقام العيادة. [OWNER-NOTES §9]
 */
export function AllLabsCard({ period }: { period: string }) {
  const entries = labEntriesForPeriod(period);
  const dues = labDuesForPeriod(period);
  const doctors = listDoctors();

  // الخلاصة تعرض الأطباء الذين لهم حركة مختبر هذا الشهر فقط — صفوف بأصفار
  // تُغرق الرقم الوحيد الذي فُتحت البطاقة لأجله.
  const rows = doctors
    .map((d) => ({
      id: d.id,
      name: d.name,
      labName: d.labName,
      ...(dues.get(d.id) ?? { fixed: 0, mobile: 0, total: 0 }),
    }))
    .filter((r) => r.fixed !== 0 || r.mobile !== 0 || r.total !== 0);

  const grand = rows.reduce(
    (acc, r) => ({
      fixed: acc.fixed + r.fixed,
      mobile: acc.mobile + r.mobile,
      total: acc.total + r.total,
    }),
    { fixed: 0, mobile: 0, total: 0 },
  );

  return (
    <Card data-tour="all-labs">
      <CardContent className="flex flex-col gap-4 py-4">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            <FlaskConical className="text-muted-foreground size-5 shrink-0" />
            مختبرات كل الأطباء — {formatPeriodAr(period)}
            <Badge variant="secondary">متابعة فقط</Badge>
          </h2>
          {/* السطر الذي يمنع قراءة الرقم مصروفاً على العيادة. لا يُخفَّت. */}
          <p className="text-sm leading-relaxed">
            دفتر المختبرات مجموعاً في مكان واحد. هذه المبالغ بين كل طبيب ومختبره
            — لا تدخل «سجل الصرفيات» ولا صافي العيادة ولا صندوقها، ولا تُخصم من
            حصة أي طبيب.
          </p>
        </div>

        {/* الخلاصة */}
        <div className="border-primary/30 bg-primary/5 rounded-lg border px-3 py-2.5">
          <p className="text-muted-foreground text-sm">
            مجموع كل المختبرات هذا الشهر
          </p>
          <p className="money text-2xl font-bold">{formatIQD(grand.total)}</p>
          <p className="text-muted-foreground text-sm">
            ثابت <span className="money text-foreground font-semibold">{formatIQD(grand.fixed)}</span>
            {" · "}
            متحرك <span className="money text-foreground font-semibold">{formatIQD(grand.mobile)}</span>
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            لا توجد تسجيلات مختبر لأي طبيب في هذا الشهر.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="text-muted-foreground pb-2 text-start text-sm">
                  الخلاصة — لكل طبيب
                </caption>
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="p-2 text-start font-medium">الطبيب</th>
                    <th className="p-2 text-start font-medium">ثابت</th>
                    <th className="p-2 text-start font-medium">متحرك</th>
                    <th className="p-2 text-start font-medium">المجموع</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="p-2">
                        <Link
                          href={`/doctors/${r.id}?period=${period}`}
                          className="text-primary inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                        >
                          {r.name}
                        </Link>
                        {r.labName ? (
                          <span className="text-muted-foreground block text-xs">
                            {r.labName}
                          </span>
                        ) : null}
                      </td>
                      <td className="money p-2 font-semibold">{formatIQD(r.fixed)}</td>
                      <td className="money p-2 font-semibold">{formatIQD(r.mobile)}</td>
                      <td className="money p-2 font-bold">{formatIQD(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* التفاصيل */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="text-muted-foreground pb-2 text-start text-sm">
                  التفاصيل — كل قيد في الشهر
                </caption>
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="p-2 text-start font-medium">التاريخ</th>
                    <th className="p-2 text-start font-medium">الطبيب</th>
                    <th className="p-2 text-start font-medium">الفرع</th>
                    <th className="p-2 text-start font-medium">المبلغ</th>
                    <th className="p-2 text-start font-medium">ملاحظة</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="p-2 whitespace-nowrap">
                        <span dir="ltr" className="tabular-nums">
                          {formatDateShort(e.entryDate)}
                        </span>
                      </td>
                      <td className="p-2">{e.doctorName}</td>
                      <td className="p-2">
                        {LAB_BRANCH_LABELS[e.branch] ?? e.branch}
                      </td>
                      <td className="money p-2 font-semibold">
                        {formatIQD(e.amount)}
                        {/* السالب دفعةٌ للمختبر — تُكتب بالنص لا بالإشارة وحدها. */}
                        {e.amount < 0 ? (
                          <span className="text-muted-foreground block text-xs font-normal">
                            دفعة للمختبر
                          </span>
                        ) : null}
                      </td>
                      <td className="p-2">
                        {[e.patientName, e.note].filter(Boolean).join(" · ") || (
                          <EmptyValue>بلا ملاحظة</EmptyValue>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
