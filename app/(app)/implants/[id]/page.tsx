import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { caseWithDetails, caseRaw, paymentsForCase, patientById } from "@/lib/queries";
import { getSettings } from "@/lib/server-utils";
import { formatIQD } from "@/lib/format";
import { formatDateShort, formatDateShortY, todayISO } from "@/lib/dates";
import { CASE_STATUS_LABELS, PAYMENT_KIND_LABELS, paymentKindLabel } from "@/lib/strings";
import { Badge } from "@/components/ui/badge";
import { MedicalBadge } from "@/components/ui/medical-badge";
import { EmptyValue, isBlank } from "@/components/ui/empty-value";
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
import { EditPaymentDialog } from "@/components/forms/edit-payment-dialog";
import { CardActions } from "../card-actions";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  open: "default",
  completed: "secondary",
  cancelled: "destructive",
};

function Field({
  label,
  children,
  strong,
}: {
  label: string;
  children: React.ReactNode;
  /** الرقم الحاسم في البطاقة — يكبر عن بقية الحقول. */
  strong?: boolean;
}) {
  return (
    <div className="space-y-1 border-b py-2 last:border-0">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className={strong ? "text-xl font-bold" : "text-base font-medium"}>
        {isBlank(children) ? <EmptyValue /> : children}
      </dd>
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
  const today = todayISO();
  // عنوان واحد: ملف المريض أولاً. عنوان البطاقة القديم (`address_snapshot`)
  // يُقرأ فقط لبطاقة مريضها بلا عنوان في ملفّه — كانت البطاقة والملف يحملان
  // عنوانين يُعدَّلان من شاشتين ولا يعرف أحدهما بالآخر. [2026-09-27]
  const address = patientById(details.patientId)?.address || raw.addressSnapshot;
  // «كلفة المختبر» لا تغيّر رقماً إلا مع «خصم المختبر من حصة الطبيب». [D6]
  const showLabCost = getSettings().labDeductedPerDoctor;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            aria-label="رجوع إلى الفهرس"
            nativeButton={false}
            render={<Link href="/implants" />}
          >
            <ArrowRight className="size-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              بطاقة زراعة رقم {details.implantCardNo ?? "…"}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-base font-medium">{details.patientName}</p>
              <MedicalBadge flags={details.patientMedicalFlags} />
            </div>
          </div>
        </div>
        <CardActions
          card={{
            caseId: raw.id,
            address,
            labCost: raw.labCost,
            listPrice: raw.listPrice,
            discount: raw.discount,
            status: raw.status,
            notes: raw.notes,
            paid: details.paid,
            remaining: details.remaining,
            patientName: details.patientName,
          }}
          today={today}
          showLabCost={showLabCost}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>بيانات البطاقة</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <Field label="رقم الكارت">
                <span className="tabular-nums">{details.implantCardNo}</span>
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
              <Field label="العنوان">{address}</Field>
              <Field label="التاريخ">
                <span dir="ltr" className="tabular-nums">
                  {formatDateShortY(details.openedDate)}
                </span>
              </Field>
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
              {showLabCost ? (
                <Field label="كلفة المختبر">
                  <span className="money tabular-nums">{formatIQD(raw.labCost)}</span>
                </Field>
              ) : null}
              <Field label="ملاحظات">
                <span className="whitespace-pre-wrap">{raw.notes}</span>
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
              <Field label="المتبقي" strong>
                <span className="money tabular-nums">{formatIQD(details.remaining)}</span>
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
                      <span dir="ltr" className="tabular-nums">
                        {formatDateShort(p.paidDate)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {paymentKindLabel(p.kind, p.amount)}
                      </Badge>
                    </TableCell>
                    <TableCell className="money text-start font-semibold tabular-nums">
                      {formatIQD(p.amount)}
                    </TableCell>
                    <TableCell>{p.doctorName}</TableCell>
                    <TableCell title={p.note ?? undefined} className="max-w-64 truncate">
                      {p.note}
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
                          patientName={details.patientName}
                        />
                        <VoidPaymentButton
                          paymentId={p.id}
                          amount={p.amount}
                          paidDate={p.paidDate}
                          patientName={details.patientName}
                        />
                      </div>
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
