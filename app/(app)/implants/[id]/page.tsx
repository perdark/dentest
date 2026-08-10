import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { caseWithDetails, caseRaw, paymentsForCase } from "@/lib/queries";
import { formatIQD } from "@/lib/format";
import { formatDateAr, todayISO } from "@/lib/dates";
import { CASE_STATUS_LABELS, PAYMENT_KIND_LABELS } from "@/lib/strings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { CardActions } from "../card-actions";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  open: "default",
  completed: "secondary",
  cancelled: "destructive",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 border-b py-2 last:border-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

export default async function ImplantCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const caseId = Number(id);
  if (!Number.isInteger(caseId) || caseId <= 0) notFound();

  const details = caseWithDetails(caseId);
  const raw = caseRaw(caseId);
  if (!details || !raw || !details.isImplant) notFound();

  const payments = paymentsForCase(caseId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            aria-label="رجوع إلى الفهرس"
            render={<Link href="/implants" />}
          >
            <ArrowRight className="size-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              بطاقة زراعة رقم {details.implantCardNo ?? "—"}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">{details.patientName}</p>
          </div>
        </div>
        <CardActions
          card={{
            caseId: raw.id,
            device: raw.device,
            address: raw.addressSnapshot,
            labCost: raw.labCost,
            listPrice: raw.listPrice,
            discount: raw.discount,
            status: raw.status,
            notes: raw.notes,
          }}
          today={todayISO()}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>بيانات البطاقة</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <Field label="رقم الحساب">
                <span className="tabular-nums">{details.accountSeqNo ?? "—"}</span>
              </Field>
              <Field label="رقم الكارت">
                <span className="tabular-nums">{details.implantCardNo ?? "—"}</span>
              </Field>
              <Field label="المريض">
                <Link
                  href={`/patients/${details.patientId}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {details.patientName}
                </Link>
              </Field>
              <Field label="الطبيب">{details.doctorName}</Field>
              <Field label="العنوان">{raw.addressSnapshot || "—"}</Field>
              <Field label="الجهاز">{raw.device || "—"}</Field>
              <Field label="التاريخ">{formatDateAr(details.openedDate)}</Field>
              <Field label="عدد الجلسات">
                {/* الجلسات فقط — الاسترجاع والتسوية ليست زيارات. [D4] */}
                <span className="tabular-nums">
                  {payments.filter(
                    (p) => p.kind === "session" || p.kind === "down_payment",
                  ).length}
                </span>
              </Field>
              <Field label="الحالة">
                <Badge variant={STATUS_VARIANT[details.status] ?? "outline"}>
                  {CASE_STATUS_LABELS[details.status] ?? details.status}
                </Badge>
              </Field>
              <Field label="كلفة المختبر">
                <span className="money tabular-nums">{formatIQD(raw.labCost)}</span>
              </Field>
              <Field label="ملاحظات">
                <span className="whitespace-pre-wrap">{raw.notes || "—"}</span>
              </Field>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>الحساب</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1">
              <Field label="الإجمالي">
                <span className="money tabular-nums">{formatIQD(details.totalPrice)}</span>
              </Field>
              <Field label="المدفوع">
                <span className="money tabular-nums">{formatIQD(details.paid)}</span>
              </Field>
              <Field label="المتبقي">
                <span className="money text-base font-bold tabular-nums">
                  {formatIQD(details.remaining)}
                </span>
              </Field>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>الجلسات والدفعات</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-muted-foreground text-sm">لا توجد دفعات مسجّلة بعد.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead className="text-start">المبلغ</TableHead>
                  <TableHead>الطبيب</TableHead>
                  <TableHead>ملاحظة</TableHead>
                  <TableHead className="sr-only">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDateAr(p.paidDate)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {PAYMENT_KIND_LABELS[p.kind] ?? p.kind}
                      </Badge>
                    </TableCell>
                    <TableCell className="money text-start tabular-nums">
                      {formatIQD(p.amount)}
                    </TableCell>
                    <TableCell>{p.doctorName}</TableCell>
                    <TableCell className="text-muted-foreground">{p.note || "—"}</TableCell>
                    <TableCell className="text-end">
                      <VoidPaymentButton
                        paymentId={p.id}
                        amount={p.amount}
                        paidDate={p.paidDate}
                        patientName={details.patientName}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
