import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, Stethoscope } from "lucide-react";
import { computeSettlement } from "@/lib/settlement";
import { doctorById, labEntriesForDoctor, labDuesForPeriod } from "@/lib/queries";
import { currentPeriod, formatDateShort, formatPeriodAr, shiftPeriod, todayISO } from "@/lib/dates";
import { formatIQD } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyValue } from "@/components/ui/empty-value";
import { DoctorInfoForm, LabEntryForm, DeleteLabEntry } from "../doctor-forms";
import { LAB_BRANCH_LABELS } from "@/lib/strings";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "ملف الطبيب" };

/**
 * سطر «تسمية ← رقم».
 *
 * `emphasis` للسطر الذي تنتهي إليه البطاقة (الحصة المستحقة، صافي العيادة):
 * كان يخرج بحجم مدخلاته نفسه، فيقرأ المالك ستة أرقام متساوية ولا يعرف أيّها
 * النتيجة. `tone="negative"` يرافقه دائماً نصٌّ يشرح السالب — اللون وحده لا
 * ينقل حالة. [عرض فقط]
 */
function Row({
  label,
  value,
  emphasis = false,
  tone = "default",
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  /**
   * `negative` — the amount itself is below zero (a real loss).
   * `outflow`  — a positive number that nevertheless *leaves* the clinic
   *              (doctor payouts, expenses). Owner decision 2026-08-27: on the
   *              owner's monthly card, money in and money out were rendered
   *              identically, so the reader had to know the vocabulary to see
   *              which lines caused a negative net.
   *
   * ⚠️ Deliberately NOT the same class. `text-destructive` is reserved for
   * genuinely negative amounts (see HANDOFF §1) — painting a normal expense in
   * the same red as a loss is the exact mistake that was undone for «الديون».
   * Outflow gets a calmer amber and a «−» sign, which states direction without
   * claiming something is wrong.
   */
  tone?: "default" | "negative" | "outflow";
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1",
        emphasis ? "text-base" : "text-sm",
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "money font-semibold",
          emphasis && "text-2xl font-bold",
          tone === "negative" && "text-destructive",
          tone === "outflow" && "text-amber-700 dark:text-amber-500",
        )}
      >
        {/* ⚠️ The minus is display-only: the underlying figure is a positive
            magnitude, and negating it in the data would break every total. */}
        {tone === "outflow" ? `− ${value}` : value}
      </span>
    </div>
  );
}

export default async function DoctorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { id } = await params;
  const doctorId = Number(id);
  if (!Number.isInteger(doctorId) || doctorId <= 0) notFound();

  const doctor = doctorById(doctorId);
  if (!doctor) notFound();

  const sp = await searchParams;
  const period =
    sp.period && /^\d{4}-\d{2}$/.test(sp.period) ? sp.period : currentPeriod();

  const result = computeSettlement(period);
  const mine = result.doctors.find((d) => d.doctorId === doctorId);
  const labDues = labDuesForPeriod(period);
  const myLab = labDues.get(doctorId) ?? { fixed: 0, mobile: 0, total: 0 };
  const entries = labEntriesForDoctor(doctorId, period);

  const prev = shiftPeriod(period, -1);
  const next = shiftPeriod(period, 1);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Stethoscope className="text-muted-foreground size-6 shrink-0" />
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              {doctor.name}
              {doctor.isOwner ? <Badge variant="secondary">المالك</Badge> : null}
            </h1>
            <p className="text-muted-foreground text-sm">
              {doctor.labName ? `المختبر: ${doctor.labName}` : "لم يُسجَّل اسم مختبر بعد"}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="h-11"
          nativeButton={false}
          render={<Link href={`/doctors?period=${period}`} />}
        >
          كل الأطباء
        </Button>
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

      {/* المالك يرى العيادة كلها أولاً — هو من يقرأ الصافي العام. [D7] */}
      {doctor.isOwner ? (
        <Card>
          <CardContent className="flex flex-col gap-2 py-4">
            <h2 className="text-lg font-semibold">العيادة هذا الشهر</h2>
            <Row label="إجمالي المُحصَّل" value={formatIQD(result.totalCollected)} />
            <Row label="مجموع حصص الأطباء" value={formatIQD(result.totalPayout)} tone="outflow" />
            <Row label="دخل الأشعة (للعيادة)" value={formatIQD(result.xrayIncome)} />
            <Row label="مصروفات الشهر" value={formatIQD(result.monthExpenses)} tone="outflow" />
            {/* خلاصة البطاقة — تُقرأ قبل مدخلاتها لا بعدها. */}
            <div className="border-primary/30 bg-primary/5 mt-1 rounded-lg border px-3 py-2.5">
              <Row
                label="صافي العيادة"
                value={formatIQD(result.clinicNet)}
                emphasis
                tone={result.clinicNet < 0 ? "negative" : "default"}
              />
              {result.clinicNet < 0 ? (
                <p className="text-destructive text-sm font-medium">
                  الصافي بالسالب — الحصص والمصروفات تجاوزت المُحصَّل هذا الشهر.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card data-tour="doctor-dues">
        <CardContent className="flex flex-col gap-2 py-4">
          {/* «مستحقات العيادة» على صفحة طبيب تُقرأ كأنها مالٌ عليه للعيادة.
              العنوان يقول اتجاه المال صراحةً. */}
          <div>
            <h2 className="text-lg font-semibold">المستحق للطبيب — حصة هذا الشهر</h2>
            <p className="text-muted-foreground text-sm">
              هذا ما تدفعه العيادة للطبيب عن الشهر المختار.
            </p>
          </div>
          {mine ? (
            <>
              <Row label="مُحصَّل — عام" value={formatIQD(mine.collectedNormal)} />
              <Row label="مُحصَّل — زراعة" value={formatIQD(mine.collectedImplant)} />
              <Row label="مُحصَّل — تقويم" value={formatIQD(mine.collectedOrtho)} />
              <Row label="مجموع المُحصَّل" value={formatIQD(mine.collectedTotal)} />
              <Row label="النسبة" value={`${mine.commissionPct}%`} />
              {/* خلاصة البطاقة. */}
              <div className="border-primary/30 bg-primary/5 mt-1 rounded-lg border px-3 py-2.5">
                <Row label="الحصة المستحقة" value={formatIQD(mine.payout)} emphasis />
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              لا توجد أرقام لهذا الطبيب في هذا الشهر.
            </p>
          )}
        </CardContent>
      </Card>

      <Card data-tour="lab-entries">
        <CardContent className="flex flex-col gap-4 py-4">
          <div>
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
              مستحقات المختبر
              <Badge variant="secondary">متابعة فقط</Badge>
            </h2>
            {/* لا يُخفَّت ولا يصغُر: هذا السطر هو ما يمنع قراءة الرقم خصماً من
                حصة الطبيب. [OWNER-NOTES §9] */}
            <p className="text-sm leading-relaxed">
              متابعة فقط بين الطبيب ومختبره — لا تدخل حصته ولا صندوق العيادة،
              ولا تُخصم من المستحق له أعلاه. أدخل مبلغاً بالسالب عند دفع مبلغ
              للمختبر.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="bg-muted/40 rounded-lg px-3 py-2.5">
              <p className="text-muted-foreground text-sm">ثابت</p>
              <p className="money text-base font-semibold">{formatIQD(myLab.fixed)}</p>
            </div>
            <div className="bg-muted/40 rounded-lg px-3 py-2.5">
              <p className="text-muted-foreground text-sm">متحرك</p>
              <p className="money text-base font-semibold">{formatIQD(myLab.mobile)}</p>
            </div>
            <div className="bg-muted rounded-lg border px-3 py-2.5">
              <p className="text-muted-foreground text-sm">المجموع</p>
              <p className="money text-xl font-bold">{formatIQD(myLab.total)}</p>
            </div>
          </div>

          <LabEntryForm doctorId={doctorId} today={todayISO()} />

          {entries.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              لا توجد تسجيلات مختبر في هذا الشهر.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-start">
                    <th className="p-2 text-start font-medium">التاريخ</th>
                    <th className="p-2 text-start font-medium">الفرع</th>
                    <th className="p-2 text-start font-medium">المبلغ</th>
                    <th className="p-2 text-start font-medium">ملاحظة</th>
                    <th className="p-2" />
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
                      <td className="p-2">{LAB_BRANCH_LABELS[e.branch] ?? e.branch}</td>
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
                      <td className="p-2 text-end">
                        <DeleteLabEntry
                          id={e.id}
                          doctorId={doctorId}
                          amount={e.amount}
                          entryDate={e.entryDate}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4">
          <h2 className="mb-3 text-lg font-semibold">بيانات الطبيب</h2>
          <DoctorInfoForm
            id={doctor.id}
            name={doctor.name}
            commissionPct={doctor.commissionPct}
            labName={doctor.labName}
            doesOrtho={doctor.doesOrtho}
            doesImplants={doctor.doesImplants}
            doesNormal={doctor.doesNormal}
            isActive={doctor.isActive}
          />
        </CardContent>
      </Card>
    </div>
  );
}
