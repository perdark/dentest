import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Grid2x2, HeartPulse, MapPin, Phone, PhoneOff, StickyNote, Stethoscope } from "lucide-react";
import {
  patientById,
  casesForPatient,
  listDoctors,
  teethForCase,
  patientToothHistory,
  normalTreatmentSuggestions,
  paymentsForPatient,
  patientDeletionImpact,
  caseRaw,
} from "@/lib/queries";
import { formatIQD } from "@/lib/format";
import { formatDateShortY, todayISO } from "@/lib/dates";
import {
  CASE_STATUS_LABELS,
  ORTHO_BUCKET,
  PAYMENT_KIND_LABELS,
  XRAY_BUCKET,
  medicalFlagsLine,
} from "@/lib/strings";
import { cn } from "@/lib/utils";
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
import { PayDialog } from "../../debts/pay-dialog";
import { AddTreatmentDialog } from "./add-treatment-dialog";
import { EditCaseDialog } from "./edit-case-dialog";
import { ConfirmDeleteDialog } from "@/components/forms/confirm-delete-dialog";
import { EditPaymentDialog } from "@/components/forms/edit-payment-dialog";
import { VoidPaymentButton } from "@/components/forms/void-payment-button";
import { deletePatientAction } from "@/lib/actions/patients";
import { deleteCaseAction } from "@/lib/actions/cases";

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
  // كم مرة عولج كل سن من قبل — تُرسم خلف مخطط «إضافة علاج».
  const toothHistory = new Map<number, number>();
  for (const e of toothEvents) {
    toothHistory.set(e.toothCode, (toothHistory.get(e.toothCode) ?? 0) + 1);
  }
  // «إضافة علاج» يفتح علاجاً عادياً — الزراعة والتقويم من شاشاتهما [D9] —
  // فيعرض أطباء العمل العادي، ويرجع إلى الكل إن لم يُعلَّم أحد.
  const normalDoctors = listDoctors({ activeOnly: true, does: "normal" });
  const treatmentDoctors = (normalDoctors.length > 0 ? normalDoctors : listDoctors()).map(
    (d) => ({ id: d.id, name: d.name }),
  );
  const today = todayISO();

  // تصحيح ما أُدخل بالخطأ: الدفعات كلها في جدول واحد، وما سيُحذف مع المريض أو
  // مع الحالة يُعدّ هنا ليُقال صراحةً في نافذة التأكيد.
  const patientPayments = paymentsForPatient(patient.id);
  const impact = patientDeletionImpact(patient.id);
  const paymentsByCase = new Map<number, { count: number; total: number }>();
  for (const p of patientPayments) {
    const agg = paymentsByCase.get(p.caseId) ?? { count: 0, total: 0 };
    paymentsByCase.set(p.caseId, { count: agg.count + 1, total: agg.total + p.amount });
  }
  // الزراعة والتقويم والأشعة تُعدَّل من شاشاتها؛ العلاج العادي يُعدَّل هنا.
  const isOrdinary = (c: (typeof cases)[number]) =>
    !c.isImplant &&
    !c.isOrtho &&
    c.bucket !== "implant" &&
    c.bucket !== ORTHO_BUCKET &&
    c.bucket !== XRAY_BUCKET;
  // الطبيب الحالي للحالة يبقى في القائمة حتى لو أُوقف، كي لا يمسحه حفظٌ لم يقصده.
  const allDoctors = listDoctors();
  const editDoctorsFor = (doctorId: number) =>
    allDoctors
      .filter((d) => d.isActive || d.id === doctorId)
      .map((d) => ({ id: d.id, name: d.name }));
  const treatmentSuggestions = normalTreatmentSuggestions();

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

      {/* بطاقة المريض يميناً والفم يساراً على الشاشة العريضة (أول عمود في
          RTL هو الأيمن)، وفوق بعضهما على الهاتف. */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        {/* بطاقة معلومات المريض */}
        <Card className="self-start">
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
                {/* ملاحظات الملف تُحفظ من «تعديل» وكانت لا تظهر في أي مكان —
                    يكتبها الموظف ثم لا يجدها. */}
                {patient.notes ? (
                  <p className="flex items-start gap-1.5">
                    <StickyNote className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    <span className="min-w-0 whitespace-pre-line break-words">{patient.notes}</span>
                  </p>
                ) : null}
              </div>

              {/* تحذير الحالة الصحية — أعلى الملف، قبل أي رقم أو حالة. */}
              {medicalLine || patient.medicalNotes ? (
                <Alert className="border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                  <HeartPulse className="text-amber-600 dark:text-amber-400" />
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
            <div className="flex shrink-0 flex-col items-end gap-2">
              <PatientForm mode="edit" patient={patient} doctors={doctorOptions} />
              <ConfirmDeleteDialog
                action={deletePatientAction}
                fields={{ id: patient.id }}
                title={`حذف المريض ${patient.fullName}`}
                ariaLabel={`حذف المريض ${patient.fullName}`}
                triggerText="حذف"
                successMessage="تم حذف المريض وكل سجلاته"
                description={
                  <>
                    <p>
                      سيُحذف المريض <strong className="text-foreground">{patient.fullName}</strong>{" "}
                      نهائياً، ومعه كل شيء مسجّل عليه:
                    </p>
                    <ul className="text-foreground list-disc space-y-1 ps-5">
                      <li>
                        <span className="tabular-nums">{impact.cases}</span> علاج/حالة
                      </li>
                      <li>
                        <span className="tabular-nums">{impact.payments}</span> دفعة
                        {impact.payments > 0 ? (
                          <>
                            {" "}بمجموع <span className="money">{formatIQD(impact.paymentsTotal)}</span>
                            {" "}— ستُطرح من تحصيل أشهرها ومن النقد المتوفر
                          </>
                        ) : null}
                      </li>
                      <li>
                        <span className="tabular-nums">{impact.appointments}</span> موعد
                      </li>
                    </ul>
                    <p className="text-destructive font-medium">هل أنت متأكد؟</p>
                    <p>يبقى نص كل ما حُذف في «سجل التعديلات».</p>
                  </>
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* مخطط الأسنان — صورة الفم المجمّعة قبل جدول الحالات: الطبيب ينظر إلى
            الفم أولاً، ثم يقرأ الأرقام. */}
        <Card className="min-w-0">
          <CardContent className="space-y-2">
            <h2 className="text-lg font-semibold">مخطط الأسنان</h2>
            <PatientToothChart events={toothEvents} />
          </CardContent>
        </Card>
      </div>

      {/* الحالات والعلاجات */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">الحالات والعلاجات</h2>
          <AddTreatmentDialog
            patientId={patient.id}
            patientName={patient.fullName}
            doctors={treatmentDoctors}
            defaultDoctorId={patient.doctorId}
            treatments={normalTreatmentSuggestions()}
            history={[...toothHistory]}
            today={today}
          />
        </div>

        {cases.length === 0 ? (
          <div className="text-muted-foreground rounded-xl px-4 py-10 text-center ring-1 ring-foreground/10">
            لا توجد حالات لهذا المريض بعد. اضغط «إضافة علاج» لإدخال علاجاته،
            الجديدة أو القديمة من الدفتر.
          </div>
        ) : (
          <div data-tour="patient-cases" className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
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
                  <TableHead>
                    <span className="sr-only">إجراءات</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((c) => {
                  // كل حالة زراعة أو تقويم تفتح صفحتها هي، لا قائمة الشاشة كلها.
                  const href = c.isImplant
                    ? `/implants/${c.id}`
                    : c.bucket === ORTHO_BUCKET
                      ? `/ortho/${c.id}`
                      : null;
                  // السجل الكامل مرة واحدة لكل حالة: ملاحظاتها تُعرض تحت اسم
                  // العلاج، وأسعارها تملأ نافذة «تعديل» للعلاج العادي.
                  const raw = caseRaw(c.id);
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
                        {/* ملاحظة الحالة كانت لا تُرى إلا بفتح «تعديل». */}
                        {raw?.notes ? (
                          <p
                            className="text-muted-foreground max-w-56 truncate text-xs"
                            title={raw.notes}
                          >
                            {raw.notes}
                          </p>
                        ) : null}
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
                      {/* جلسة على حالة مفتوحة تُضاف من هنا بتاريخها، كما من
                          «الديون». التقويم يُسدَّد من شاشته. */}
                      <TableCell className="text-end">
                        <div className="flex items-center justify-end gap-1">
                          {c.status === "open" && c.bucket !== ORTHO_BUCKET && c.remaining > 0 ? (
                            <PayDialog
                              caseId={c.id}
                              patientName={`${patient.fullName} — ${c.treatment}`}
                              remaining={c.remaining}
                              today={today}
                            />
                          ) : null}
                          {isOrdinary(c) && raw ? (
                            <EditCaseDialog
                              caseId={c.id}
                              treatment={c.treatment}
                              doctorId={c.doctorId}
                              openedDate={c.openedDate}
                              listPrice={raw.listPrice}
                              discount={raw.discount}
                              totalPrice={raw.totalPrice}
                              notes={raw.notes}
                              paid={c.paid}
                              doctors={editDoctorsFor(c.doctorId)}
                              treatments={treatmentSuggestions}
                              today={today}
                            />
                          ) : null}
                          <ConfirmDeleteDialog
                            action={deleteCaseAction}
                            fields={{ caseId: c.id }}
                            title={`حذف ${c.treatment}`}
                            ariaLabel={`حذف ${c.treatment}`}
                            successMessage="تم حذف العلاج"
                            description={(() => {
                              const agg = paymentsByCase.get(c.id);
                              return (
                                <>
                                  <p>
                                    سيُحذف علاج «{c.treatment}» الخاص بـ {patient.fullName} نهائياً
                                    {c.isImplant && c.implantCardNo != null
                                      ? ` (بطاقة زراعة #${c.implantCardNo})`
                                      : ""}
                                    .
                                  </p>
                                  {agg ? (
                                    <p className="text-foreground">
                                      ومعه <span className="tabular-nums">{agg.count}</span> دفعة
                                      بمجموع <span className="money">{formatIQD(agg.total)}</span> —
                                      ستُطرح من تحصيل أشهرها ومن النقد المتوفر.
                                    </p>
                                  ) : null}
                                  <p className="text-destructive font-medium">هل أنت متأكد؟</p>
                                </>
                              );
                            })()}
                          />
                        </div>
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

      {/* الدفعات — كل ما قُبض من المريض، ويُصحَّح أو يُحذف من هنا. */}
      {patientPayments.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">الدفعات</h2>
          <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>العلاج</TableHead>
                  <TableHead className="hidden sm:table-cell">النوع</TableHead>
                  <TableHead className="hidden md:table-cell">ملاحظة</TableHead>
                  <TableHead className="text-end">المبلغ</TableHead>
                  <TableHead>
                    <span className="sr-only">إجراءات</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patientPayments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap">
                      <span dir="ltr" className="tabular-nums">
                        {formatDateShortY(p.paidDate)}
                      </span>
                    </TableCell>
                    <TableCell>{p.treatment}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {PAYMENT_KIND_LABELS[p.kind] ?? p.kind}
                    </TableCell>
                    <TableCell className="hidden max-w-56 truncate md:table-cell" title={p.note ?? undefined}>
                      {p.note}
                    </TableCell>
                    <TableCell className="text-end">
                      <span className={cn("money", p.amount < 0 && "text-destructive")}>
                        {formatIQD(p.amount)}
                      </span>
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-1">
                        <EditPaymentDialog
                          paymentId={p.id}
                          amount={p.amount}
                          kind={p.kind}
                          paidDate={p.paidDate}
                          note={p.note}
                          today={today}
                          patientName={patient.fullName}
                        />
                        <VoidPaymentButton
                          paymentId={p.id}
                          amount={p.amount}
                          paidDate={p.paidDate}
                          patientName={patient.fullName}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
