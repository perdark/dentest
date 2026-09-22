import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Grid2x2, HeartPulse, MapPin, Phone, PhoneOff, Stethoscope } from "lucide-react";
import {
  patientById,
  casesForPatient,
  listDoctors,
  teethForCase,
  patientToothHistory,
} from "@/lib/queries";
import { formatIQD } from "@/lib/format";
import { formatDateShortY } from "@/lib/dates";
import { CASE_STATUS_LABELS, ORTHO_BUCKET, medicalFlagsLine } from "@/lib/strings";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyValue } from "@/components/ui/empty-value";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PatientToothChart } from "@/components/tooth-chart/patient-tooth-chart";
import { PatientForm } from "../patient-form";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  open: "default",
  completed: "secondary",
  cancelled: "outline",
};

export default async function PatientProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const patient = patientById(Number(id));
  if (!patient) notFound();

  const medicalLine = medicalFlagsLine(patient.medicalFlags);

  /*
   * الأطباء المعروضون في «تعديل»: المفعّلون، ومعهم طبيب هذا المريض إن كان قد
   * أُوقف بعد تسجيله. بدون هذا الاستثناء يفتح الموظف نافذة التعديل ليغيّر رقم
   * الهاتف فيجد خانة الطبيب فارغة، ويمسح بالحفظ ارتباطاً لم يقصد لمسه.
   */
  const activeDoctors = listDoctors({ activeOnly: true });
  const assignedDoctor = patient.doctorId
    ? listDoctors().find((d) => d.id === patient.doctorId)
    : undefined;
  const doctorOptions = [
    ...(activeDoctors.length > 0 ? activeDoctors : listDoctors()),
    ...(assignedDoctor && !activeDoctors.some((d) => d.id === assignedDoctor.id)
      ? [assignedDoctor]
      : []),
  ]
    .filter((d, i, all) => all.findIndex((x) => x.id === d.id) === i)
    .map((d) => ({ id: d.id, name: d.name, isActive: d.isActive }));

  const cases = casesForPatient(patient.id);
  // Marked-tooth count per case, so the file shows at a glance which visits
  // were charted and which are still prose in a note.
  const markCounts = new Map(cases.map((c) => [c.id, teethForCase(c.id).length]));
  const toothMarkCount = (caseId: number) => markCounts.get(caseId) ?? 0;
  // كل سن عولج لهذا المريض، عبر كل حالاته — الصورة المجمّعة للفم. لا يُخزَّن
  // شيء هنا: القراءة من `case_teeth` نفسها، فلا يمكن أن تخالف الحالات.
  const toothEvents = patientToothHistory(patient.id)
    .filter((e) => e.scope === "tooth" && e.toothCode !== null)
    .map((e) => ({
      toothCode: e.toothCode as number,
      treatmentKey: e.treatmentKey,
      treatmentAr: e.treatmentAr,
      openedDate: formatDateShortY(e.openedDate),
      doctorName: e.doctorName,
      caseId: e.caseId,
      caseStatus: e.caseStatus,
    }));
  // التقويم لا رصيد عليه: لا يوجد إجمالي متفق عليه، فالفرق بين الإجمالي
  // المحفوظ والمدفوع ليس ديناً. يُستثنى هنا كما يُستثنى في «الديون» حتى لا
  // يقرأ الموظف رقمين متناقضين عن المريض نفسه. [2026-08-19]
  const totalRemaining = cases.reduce(
    (sum, c) =>
      sum + (c.status === "cancelled" || c.bucket === ORTHO_BUCKET ? 0 : c.remaining),
    0,
  );

  return (
    <div className="space-y-4">
      <Link
        href="/patients"
        className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center gap-1 text-sm"
      >
        <ArrowRight className="size-4" />
        كل المرضى
      </Link>

      {/* بطاقة معلومات المريض */}
      <Card>
        <CardContent className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <h1 className="text-xl font-bold">{patient.fullName}</h1>
            <div className="space-y-1 text-sm">
              {patient.phone ? (
                <a
                  href={`tel:${patient.phone}`}
                  dir="ltr"
                  className="text-primary flex min-h-11 w-fit items-center gap-1.5 underline-offset-4 hover:underline"
                >
                  <Phone className="size-4 shrink-0" />
                  <span className="money">{patient.phone}</span>
                </a>
              ) : (
                <p className="flex min-h-11 items-center gap-1.5">
                  <PhoneOff className="text-muted-foreground size-4 shrink-0" />
                  <EmptyValue>لا يوجد رقم هاتف</EmptyValue>
                </p>
              )}
              {assignedDoctor ? (
                <p className="flex items-center gap-1.5">
                  <Stethoscope className="text-muted-foreground size-4 shrink-0" />
                  {assignedDoctor.name}
                </p>
              ) : null}
              {patient.address ? (
                <p className="flex items-center gap-1.5">
                  <MapPin className="text-muted-foreground size-4 shrink-0" />
                  {patient.address}
                </p>
              ) : null}
            </div>

            {/* تحذير الحالة الصحية — أعلى الملف، قبل أي رقم أو حالة. */}
            {medicalLine || patient.medicalNotes ? (
              <Alert className="border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                <HeartPulse className="text-amber-600" />
                <AlertTitle>حالة صحية يجب الانتباه لها:</AlertTitle>
                <AlertDescription className="text-amber-900/90 dark:text-amber-100/90">
                  {medicalLine ? <p className="font-medium">{medicalLine}</p> : null}
                  {patient.medicalNotes ? (
                    <p className="whitespace-pre-line">{patient.medicalNotes}</p>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
          <PatientForm mode="edit" patient={patient} doctors={doctorOptions} />
        </CardContent>
      </Card>

      {/* مخطط الأسنان — صورة الفم المجمّعة قبل جدول الحالات: الطبيب ينظر إلى
          الفم أولاً، ثم يقرأ الأرقام. */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">مخطط الأسنان</h2>
        <Card>
          <CardContent>
            <PatientToothChart events={toothEvents} />
          </CardContent>
        </Card>
      </div>

      {/* الحالات والعلاجات */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">الحالات والعلاجات</h2>

        {cases.length === 0 ? (
          <div className="text-muted-foreground rounded-xl px-4 py-10 text-center ring-1 ring-foreground/10">
            لا توجد حالات مسجّلة لهذا المريض.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>العلاج</TableHead>
                  <TableHead className="hidden md:table-cell">الطبيب</TableHead>
                  <TableHead className="hidden sm:table-cell">تاريخ الفتح</TableHead>
                  <TableHead className="hidden text-end sm:table-cell">الإجمالي</TableHead>
                  <TableHead className="text-end">المدفوع</TableHead>
                  <TableHead className="text-end">المتبقي</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-end">المخطط</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((c) => {
                  const href = c.isImplant
                    ? `/implants/${c.id}`
                    : c.bucket === "ortho"
                      ? "/ortho"
                      : null;
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        {href ? (
                          <Link
                            href={href}
                            className="text-primary inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
                          >
                            {c.treatment}
                          </Link>
                        ) : (
                          <span className="font-medium">{c.treatment}</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{c.doctorName}</TableCell>
                      <TableCell className="hidden whitespace-nowrap sm:table-cell">
                        <span dir="ltr" className="tabular-nums">
                          {formatDateShortY(c.openedDate)}
                        </span>
                      </TableCell>
                      <TableCell className="hidden text-end sm:table-cell">
                        <span className="money">{formatIQD(c.totalPrice)}</span>
                      </TableCell>
                      <TableCell className="text-end">
                        <span className="money">{formatIQD(c.paid)}</span>
                      </TableCell>
                      {/* «المتبقي» هو ما يُقرأ من هذا الجدول فيكبر عن جيرانه، ولا
                          يُلوَّن بالأحمر: رصيد المريض ليس مبلغاً سالباً. */}
                      <TableCell className="text-end">
                        {c.bucket === ORTHO_BUCKET ? (
                          <EmptyValue>لا ينطبق</EmptyValue>
                        ) : (
                          <span className="money text-lg font-bold">
                            {formatIQD(c.remaining)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[c.status] ?? "outline"}>
                          {CASE_STATUS_LABELS[c.status] ?? c.status}
                        </Badge>
                      </TableCell>
                      {/* المخطط متاح لكل حالة: حتى التقويم والتنظيف يُسجَّلان
                          على فك أو على الفم كامل، لا على سن بعينه. */}
                      <TableCell className="text-end">
                        <Link
                          href={`/cases/${c.id}/teeth`}
                          aria-label={`مخطط أسنان — ${c.treatment}`}
                          className="text-primary inline-flex min-h-11 items-center gap-1 text-sm underline-offset-4 hover:underline"
                        >
                          {toothMarkCount(c.id) > 0 ? (
                            <span className="tabular-nums" dir="ltr">
                              {toothMarkCount(c.id)}
                            </span>
                          ) : null}
                          <Grid2x2 className="size-4" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* إجمالي المتبقي على المريض */}
        <div className="bg-muted/50 flex items-center justify-between gap-3 rounded-xl px-4 py-3 ring-1 ring-foreground/10">
          <span className="font-medium">إجمالي المتبقي على المريض</span>
          <span className="money text-2xl font-bold">{formatIQD(totalRemaining)}</span>
        </div>
      </div>
    </div>
  );
}
