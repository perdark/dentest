import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft, ChevronRight, Stethoscope } from "lucide-react";
import { computeSettlement } from "@/lib/settlement";
import { doctorById, labEntriesForDoctor, labDuesForPeriod } from "@/lib/queries";
import { currentPeriod, formatPeriodAr, shiftPeriod, todayISO } from "@/lib/dates";
import { formatIQD } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DoctorInfoForm, LabEntryForm, DeleteLabEntry } from "../doctor-forms";
import { LAB_BRANCH_LABELS } from "@/lib/strings";

export const metadata: Metadata = { title: "ملف الطبيب" };

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="money font-semibold">{value}</span>
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

      {/* المالك يرى العيادة كلها أولاً — هو من يقرأ الصافي العام. [D7] */}
      {doctor.isOwner ? (
        <Card>
          <CardContent className="flex flex-col gap-2 py-4">
            <h2 className="text-lg font-semibold">العيادة هذا الشهر</h2>
            <Row label="إجمالي المُحصَّل" value={formatIQD(result.totalCollected)} />
            <Row label="مجموع حصص الأطباء" value={formatIQD(result.totalPayout)} />
            <Row label="دخل الأشعة (للعيادة)" value={formatIQD(result.xrayIncome)} />
            <Row label="مصروفات الشهر" value={formatIQD(result.monthExpenses)} />
            <div className="mt-1 border-t pt-2">
              <Row label="صافي العيادة" value={formatIQD(result.clinicNet)} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card data-tour="doctor-dues">
        <CardContent className="flex flex-col gap-2 py-4">
          <h2 className="text-lg font-semibold">مستحقات العيادة</h2>
          {mine ? (
            <>
              <Row label="مُحصَّل — عام" value={formatIQD(mine.collectedNormal)} />
              <Row label="مُحصَّل — زراعة" value={formatIQD(mine.collectedImplant)} />
              <Row label="مُحصَّل — تقويم" value={formatIQD(mine.collectedOrtho)} />
              <Row label="مجموع المُحصَّل" value={formatIQD(mine.collectedTotal)} />
              <Row label="النسبة" value={`${mine.commissionPct}%`} />
              <div className="mt-1 border-t pt-2">
                <Row label="الحصة المستحقة" value={formatIQD(mine.payout)} />
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
            <h2 className="text-lg font-semibold">مستحقات المختبر</h2>
            <p className="text-muted-foreground text-sm">
              متابعة فقط — لا تدخل حصة الطبيب ولا صندوق العيادة. أدخل مبلغاً
              بالسالب عند دفع مبلغ للمختبر.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="bg-muted/40 rounded-lg px-3 py-2">
              <p className="text-muted-foreground text-xs">ثابت</p>
              <p className="money font-semibold">{formatIQD(myLab.fixed)}</p>
            </div>
            <div className="bg-muted/40 rounded-lg px-3 py-2">
              <p className="text-muted-foreground text-xs">متحرك</p>
              <p className="money font-semibold">{formatIQD(myLab.mobile)}</p>
            </div>
            <div className="bg-muted/40 rounded-lg px-3 py-2">
              <p className="text-muted-foreground text-xs">المجموع</p>
              <p className="money font-semibold">{formatIQD(myLab.total)}</p>
            </div>
          </div>

          <LabEntryForm doctorId={doctorId} today={todayISO()} />

          {entries.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              لا توجد قيود مختبر في هذا الشهر.
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
                      <td className="p-2 whitespace-nowrap">{e.entryDate}</td>
                      <td className="p-2">{LAB_BRANCH_LABELS[e.branch] ?? e.branch}</td>
                      <td className="money p-2 font-semibold">{formatIQD(e.amount)}</td>
                      <td className="text-muted-foreground p-2">
                        {[e.patientName, e.note].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="p-2 text-end">
                        <DeleteLabEntry id={e.id} doctorId={doctorId} />
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
            isActive={doctor.isActive}
          />
        </CardContent>
      </Card>
    </div>
  );
}
