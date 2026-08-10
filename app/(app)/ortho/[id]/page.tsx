import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { caseWithDetails, caseRaw, paymentsForCase } from "@/lib/queries";
import { formatIQD } from "@/lib/format";
import { formatDateAr, todayISO } from "@/lib/dates";
import { PAYMENT_KIND_LABELS, CASE_STATUS_LABELS } from "@/lib/strings";
import { Badge } from "@/components/ui/badge";
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
  // القائمة مرتّبة من الأحدث، والمقدمة هي أوّل دفعة لا آخرها. [D5]
  const downPayment = payments.findLast((p) => p.kind === "down_payment");
  const today = todayISO();

  return (
    <div className="space-y-6">
      <Link
        href="/ortho"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
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
        {raw.hasComplaint ? (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="size-3" />
            شكوى مسجّلة
          </Badge>
        ) : null}
      </div>

      {/* Money summary */}
      <Card>
        <CardHeader>
          <CardTitle>الحساب</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Figure label="الإجمالي" value={formatIQD(detail.totalPrice)} />
          <Figure label="الخصم" value={formatIQD(raw.discount)} />
          <Figure label="المقدمة" value={downPayment ? formatIQD(downPayment.amount) : "—"} />
          <Figure label="المدفوع" value={formatIQD(detail.paid)} />
          <Figure
            label="المتبقي"
            value={formatIQD(detail.remaining)}
            highlight={detail.remaining > 0}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Appointment + complaint (dispute protection) */}
        <Card>
          <CardHeader>
            <CardTitle>الموعد والشكوى</CardTitle>
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

        {/* Add a session payment */}
        <Card>
          <CardHeader>
            <CardTitle>تسجيل دفعة جلسة</CardTitle>
          </CardHeader>
          <CardContent>
            <OrthoPaymentForm
              caseId={caseId}
              today={today}
              canCollect={detail.status === "open" && detail.remaining > 0}
            />
          </CardContent>
        </Card>
      </div>

      {/* Sessions / payments history */}
      <Card>
        <CardHeader>
          <CardTitle>الجلسات والدفعات</CardTitle>
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
                    <TableCell>{formatDateAr(p.paidDate)}</TableCell>
                    <TableCell>
                      <Badge variant={p.kind === "down_payment" ? "default" : "secondary"}>
                        {PAYMENT_KIND_LABELS[p.kind] ?? p.kind}
                      </Badge>
                    </TableCell>
                    <TableCell>{p.doctorName}</TableCell>
                    <TableCell className="money text-end font-medium">
                      {formatIQD(p.amount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.note ?? "—"}
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
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={
          "money text-base font-semibold " + (highlight ? "text-destructive" : "")
        }
      >
        {value}
      </p>
    </div>
  );
}
