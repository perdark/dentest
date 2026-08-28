import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, StickyNote } from "lucide-react";
import { caseWithDetails, caseRaw, paymentsForCase } from "@/lib/queries";
import { formatIQD } from "@/lib/format";
import { formatDateShortY, todayISO } from "@/lib/dates";
import { PAYMENT_KIND_LABELS, CASE_STATUS_LABELS } from "@/lib/strings";
import { Badge } from "@/components/ui/badge";
import { MedicalBadge } from "@/components/ui/medical-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VoidPaymentButton } from "@/components/forms/void-payment-button";
import { OrthoMetaForm } from "./ortho-meta-form";
import { OrthoPaymentForm } from "./payment-form";
import { OrthoDownPaymentSection } from "./down-payment-form";
import { OrthoStatusButton } from "./case-status-form";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  open: "default",
  completed: "secondary",
  cancelled: "destructive",
};

export default async function OrthoCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caseId = Number(id);
  if (!Number.isInteger(caseId) || caseId <= 0) notFound();

  const detail = caseWithDetails(caseId);
  const raw = caseRaw(caseId);
  // سجل التقويم يعرض حالات التقويم فقط — تماماً كما يتحقّق سجل الزراعة. [D2]
  if (!detail || !raw || !detail.isOrtho) notFound();

  const payments = paymentsForCase(caseId);
  // المقدمة صارت مبلغاً متفقاً عليه يُسدَّد على دفعات: المقبوض هو مجموع قيود
  // «المقدمة» كلها، لا أوّل دفعة وحدها. [قرار العيادة 2026-08-25]
  const downPaymentAgreed = raw.downPaymentAgreed;
  const downPaymentCollected = payments
    .filter((p) => p.kind === "down_payment")
    .reduce((sum, p) => sum + p.amount, 0);
  const downPaymentRemaining = Math.max(0, downPaymentAgreed - downPaymentCollected);
  const today = todayISO();

  // ترقيم الجلسات من الأقدم إلى الأحدث: «الجلسة ١» هي أوّل جلسة جرت، مهما كان
  // ترتيب الجدول المعروض. القيود المؤرَّخة في اليوم نفسه تُرتَّب بـ id.
  const sessionNumbers = new Map<number, number>();
  payments
    .filter((p) => p.kind === "session")
    .slice()
    .sort((a, b) =>
      a.paidDate === b.paidDate ? a.id - b.id : a.paidDate < b.paidDate ? -1 : 1,
    )
    .forEach((p, i) => sessionNumbers.set(p.id, i + 1));

  function paymentLabel(p: (typeof payments)[number]): string {
    if (p.kind === "session") {
      const no = sessionNumbers.get(p.id);
      return no ? `الجلسة ${no}` : "جلسة";
    }
    if (p.kind === "down_payment") return "دفعة من المقدمة";
    return PAYMENT_KIND_LABELS[p.kind] ?? p.kind;
  }

  return (
    <div className="space-y-6">
      <Link
        href="/ortho"
        className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center gap-1.5 text-sm"
      >
        <ArrowRight className="size-4" />
        عودة إلى سجل التقويم
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{detail.patientName}</h1>
        <Badge variant="secondary">{detail.treatment}</Badge>
        <Badge variant={STATUS_VARIANT[detail.status] ?? "secondary"}>
          {CASE_STATUS_LABELS[detail.status] ?? detail.status}
        </Badge>
        <MedicalBadge flags={detail.patientMedicalFlags} />
        {raw.hasComplaint ? (
          <Badge variant="secondary" className="gap-1">
            <StickyNote className="size-3" />
            ملاحظة مسجّلة
          </Badge>
        ) : null}
        {/* الحالة تبقى «مفتوح» حتى تُغلقها العيادة بيدها — الزر بجانب الشارة
            حتى لا يُسأل «وكيف أغلقها؟». */}
        <div className="ms-auto">
          <OrthoStatusButton
            caseId={caseId}
            status={detail.status}
            patientName={detail.patientName}
          />
        </div>
      </div>

      {/* Money summary — لا إجمالي متفق عليه في التقويم [2026-08-19]، والمقدمة
          ثلاثة أرقام لا رقم واحد: المتفق عليه، والمقبوض منه، وما بقي. */}
      <Card>
        <CardHeader>
          <CardTitle>الحساب</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Figure label="المقدمة المتفق عليها" value={formatIQD(downPaymentAgreed)} />
          <Figure label="المقبوض من المقدمة" value={formatIQD(downPaymentCollected)} />
          <Figure
            label="المتبقي من المقدمة"
            value={formatIQD(downPaymentRemaining)}
            highlight={downPaymentRemaining > 0}
          />
          <Figure label="إجمالي المدفوع" value={formatIQD(detail.paid)} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Appointment + complaint (dispute protection) */}
        <Card>
          <CardHeader>
            <CardTitle>الموعد والملاحظات</CardTitle>
          </CardHeader>
          <CardContent>
            <OrthoMetaForm
              caseId={caseId}
              nextAppointment={raw.nextAppointment}
              hasComplaint={raw.hasComplaint}
              complaintNote={raw.complaintNote}
            />
          </CardContent>
        </Card>

        {/* Add a session */}
        <Card>
          <CardHeader>
            <CardTitle>إضافة جلسة</CardTitle>
          </CardHeader>
          <CardContent>
            {/* لا شرط «متبقٍ»: الجلسة تُسعَّر عند إضافتها ما دامت الحالة مفتوحة. */}
            <OrthoPaymentForm
              caseId={caseId}
              today={today}
              paidSoFar={detail.paid}
              canCollect={detail.status === "open"}
            />
          </CardContent>
        </Card>
      </div>

      {/* المقدمة: اتفاقٌ يُحدَّد، ثم قبضٌ على دفعات. */}
      <Card>
        <CardHeader>
          <CardTitle>المقدمة</CardTitle>
        </CardHeader>
        <CardContent>
          <OrthoDownPaymentSection
            caseId={caseId}
            today={today}
            agreed={downPaymentAgreed}
            collected={downPaymentCollected}
            canCollect={detail.status === "open"}
          />
        </CardContent>
      </Card>

      {/* Sessions / payments history */}
      <Card>
        <CardHeader>
          <CardTitle>الجلسات والدفعات</CardTitle>
          <p className="text-muted-foreground text-sm">
            كل جلسة برقمها ومبلغها وتاريخها، ودفعات المقدمة بينها.
          </p>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>التاريخ</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>الطبيب</TableHead>
                <TableHead className="text-end">المبلغ</TableHead>
                <TableHead>ملاحظة</TableHead>
                <TableHead className="sr-only">إجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground py-8 text-center">
                    لا توجد دفعات بعد.
                  </TableCell>
                </TableRow>
              ) : (
                payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap">
                      <span dir="ltr" className="tabular-nums">
                        {formatDateShortY(p.paidDate)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {/* «الجلسة ٢» تقول ما لا يقوله «جلسة»: هذه ثاني زيارة
                          مدفوعة في هذا الملف، لا زيارة مجهولة الترتيب. */}
                      <Badge variant={p.kind === "down_payment" ? "default" : "secondary"}>
                        {paymentLabel(p)}
                      </Badge>
                    </TableCell>
                    <TableCell>{p.doctorName}</TableCell>
                    <TableCell className="money text-end text-lg font-bold">
                      {formatIQD(p.amount)}
                    </TableCell>
                    <TableCell title={p.note ?? undefined} className="max-w-64 truncate">
                      {p.note}
                    </TableCell>
                    <TableCell className="text-end">
                      <VoidPaymentButton
                        paymentId={p.id}
                        amount={p.amount}
                        paidDate={p.paidDate}
                        patientName={detail.patientName}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Figure({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="space-y-1">
      {/* التسمية تقول ما هو الرقم — لا تصغر عنه. */}
      <p className="text-muted-foreground text-sm">{label}</p>
      <p
        className={
          "money text-2xl font-bold " + (highlight ? "text-destructive" : "")
        }
      >
        {value}
      </p>
    </div>
  );
}
