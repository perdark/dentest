"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CircleCheckBig, Lock, Unlock } from "lucide-react";
import type { SettlementResult, DoctorSettlement } from "@/lib/settlement";
import {
  calculateDoctorPayout,
  normalizeCommissionPct,
  payoutShortfall,
} from "@/lib/settlement-math";
import { formatIQD } from "@/lib/format";
import { formatPeriodAr } from "@/lib/dates";
import { SETTLEMENT_STATUS_LABELS } from "@/lib/strings";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  closeMonth,
  reopenMonth,
  markPaid,
  type CloseState,
  type PayoutState,
} from "@/lib/actions/settlement";

const CLOSE_FORM_ID = "settlement-close-form";

/** إقفال/إعادة فتح يُبلّغان بالنتيجة بدل الفشل الصامت. [D1] */
function useMonthAction(
  action: (prev: CloseState, data: FormData) => Promise<CloseState>,
  successMessage: string,
) {
  const [state, formAction] = useActionState<CloseState, FormData>(action, {});
  const seen = useRef<CloseState | null>(null);

  useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (state.ok) toast.success(successMessage);
    else if (state.error) toast.error(state.error);
  }, [state, successMessage]);

  return formAction;
}

export function SettlementTable({
  result,
  period,
  today,
}: {
  result: SettlementResult;
  period: string;
  today: string;
}) {
  // النِّسَب القابلة للتحرير — للمعاينة الحيّة فقط؛ الحساب النهائي يجري على الخادم.
  const [pcts, setPcts] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    for (const d of result.doctors) init[d.doctorId] = String(d.commissionPct);
    return init;
  });

  // حالة فتح نافذة تأكيد الإقفال (محكومة).
  const [closeOpen, setCloseOpen] = useState(false);
  const closeAction = useMonthAction(closeMonth, "تم إقفال الشهر");
  const reopenAction = useMonthAction(reopenMonth, "تمت إعادة فتح الشهر");

  // الحقل الفارغ يعني «غير محدّدة» فيرجع إلى نسبة الطبيب — وليس صفراً. [A5]
  function formulaFor(d: DoctorSettlement) {
    return {
      collectedTotal: d.collectedTotal,
      labCost: d.labCost,
      commissionPct: normalizeCommissionPct(pcts[d.doctorId], d.commissionPct),
      labDeductedPerDoctor: result.labDeductedPerDoctor,
      pctAppliedAfterLab: result.pctAppliedAfterLab,
    };
  }

  function payoutFor(d: DoctorSettlement): number {
    if (d.status === "closed") return d.payout; // مُجمّد بعد الإقفال
    return calculateDoctorPayout(formulaFor(d));
  }

  function shortfallFor(d: DoctorSettlement): number {
    if (d.status === "closed") return d.shortfall;
    return payoutShortfall(formulaFor(d));
  }

  const sumImplant = result.doctors.reduce((a, d) => a + d.collectedImplant, 0);
  const sumOrtho = result.doctors.reduce((a, d) => a + d.collectedOrtho, 0);
  const sumNormal = result.doctors.reduce((a, d) => a + d.collectedNormal, 0);
  const sumAccrued = result.doctors.reduce((a, d) => a + d.accruedTotal, 0);
  const totalCollected = result.totalCollected;
  const liveTotalPayout = result.doctors.reduce((a, d) => a + payoutFor(d), 0);
  const clinicNet = totalCollected - liveTotalPayout - result.monthExpenses;

  const canClose = !result.anyClosed && !result.anyPaid;
  const canReopen = (result.anyClosed || result.anyStale) && !result.anyPaid;
  const payoutDoctors = result.doctors.filter(
    (d) => d.status === "closed" && d.payout > 0,
  );

  return (
    <div className="flex flex-col gap-4">
      {/* النموذج الذي يحمل النِّسَب — يُرسَل إلى closeMonth عند تأكيد الإقفال. */}
      <form id={CLOSE_FORM_ID} action={closeAction} className="flex flex-col gap-4">
        <input type="hidden" name="period" value={period} />

        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الطبيب</TableHead>
                  <TableHead className="text-end">محصّل زراعة</TableHead>
                  <TableHead className="text-end">محصّل تقويم</TableHead>
                  <TableHead className="text-end">محصّل عادي</TableHead>
                  <TableHead className="text-end">إجمالي المحصّل</TableHead>
                  <TableHead className="text-end">
                    العمل المنجز
                    <span className="text-muted-foreground block text-[10px] font-normal">
                      يُحتسب عند فتح الحالة
                    </span>
                  </TableHead>
                  <TableHead className="text-center">النسبة %</TableHead>
                  <TableHead className="text-end">الحصة</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {result.doctors.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-muted-foreground py-8 text-center"
                    >
                      لا يوجد أطباء مُسجّلون.
                    </TableCell>
                  </TableRow>
                ) : (
                  result.doctors.map((d) => {
                    const closed = d.status === "closed";
                    return (
                      <TableRow key={d.doctorId}>
                        <TableCell className="font-medium">
                          <span className="inline-flex items-center gap-2">
                            {d.doctorName}
                            {d.isOwner ? (
                              <Badge variant="secondary">مالك</Badge>
                            ) : null}
                          </span>
                        </TableCell>
                        <TableCell className="money text-end">
                          {formatIQD(d.collectedImplant)}
                        </TableCell>
                        <TableCell className="money text-end">
                          {formatIQD(d.collectedOrtho)}
                        </TableCell>
                        <TableCell className="money text-end">
                          {formatIQD(d.collectedNormal)}
                        </TableCell>
                        <TableCell className="money text-end font-semibold">
                          {formatIQD(d.collectedTotal)}
                        </TableCell>
                        <TableCell className="money text-muted-foreground text-end">
                          {formatIQD(d.accruedTotal)}
                        </TableCell>
                        <TableCell className="text-center">
                          {closed ? (
                            <span className="tabular-nums font-medium">
                              {d.commissionPct}%
                            </span>
                          ) : (
                            <Input
                              type="number"
                              name={`pct_${d.doctorId}`}
                              value={pcts[d.doctorId] ?? ""}
                              onChange={(e) =>
                                setPcts((p) => ({
                                  ...p,
                                  [d.doctorId]: e.target.value,
                                }))
                              }
                              inputMode="decimal"
                              min={0}
                              max={100}
                              step={1}
                              aria-label={`نسبة ${d.doctorName}`}
                              className="mx-auto h-11 w-16 text-center tabular-nums"
                            />
                          )}
                        </TableCell>
                        <TableCell className="money text-end font-semibold">
                          {formatIQD(payoutFor(d))}
                          {shortfallFor(d) > 0 ? (
                            <span className="text-destructive mt-0.5 block text-[10px] font-normal">
                              المختبر يزيد {formatIQD(shortfallFor(d))} عن الحصة —
                              يُسوّى يدوياً
                            </span>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>

              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold">الإجمالي</TableCell>
                  <TableCell className="money text-end">{formatIQD(sumImplant)}</TableCell>
                  <TableCell className="money text-end">{formatIQD(sumOrtho)}</TableCell>
                  <TableCell className="money text-end">{formatIQD(sumNormal)}</TableCell>
                  <TableCell className="money text-end font-bold">
                    {formatIQD(totalCollected)}
                  </TableCell>
                  <TableCell className="money text-muted-foreground text-end">
                    {formatIQD(sumAccrued)}
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">—</TableCell>
                  <TableCell className="money text-end font-bold">
                    {formatIQD(liveTotalPayout)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        {canClose ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <p className="text-muted-foreground me-auto text-xs">
              الإقفال يُجمّد النِّسَب والحصص كما تظهر الآن.
            </p>
            <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
              <DialogTrigger
                render={
                  <Button type="button" className="h-11">
                    <Lock data-icon="inline-start" />
                    إقفال الشهر
                  </Button>
                }
              />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>تأكيد إقفال {formatPeriodAr(period)}</DialogTitle>
                  <DialogDescription>
                    يُجمّد الإقفال النِّسَب والحصص والمبالغ المُحصّلة كما هي الآن. الأرقام
                    غير مؤكدة وتُراجع مع العيادة، ويمكنك إعادة فتح الشهر لاحقاً.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <DialogClose
                    render={
                      <Button type="button" variant="outline" className="h-11">
                        إلغاء
                      </Button>
                    }
                  />
                  <SubmitButton
                    form={CLOSE_FORM_ID}
                    className="h-11"
                    pendingText="جارٍ الإقفال…"
                  >
                    <Lock data-icon="inline-start" />
                    تأكيد الإقفال
                  </SubmitButton>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        ) : null}
      </form>

      {/* صافي العيادة — يُعاد حسابه حيّاً مع تعديل النِّسَب. */}
      <Card size="sm" className="bg-primary/5 ring-primary/30">
        <CardHeader>
          <CardTitle>صافي العيادة</CardTitle>
          <CardDescription>
            إجمالي المحصّل − إجمالي الحصص − مصروفات الشهر
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <p className="money text-muted-foreground text-sm">
            {formatIQD(totalCollected)} − {formatIQD(liveTotalPayout)} −{" "}
            {formatIQD(result.monthExpenses)}
          </p>
          <p
            className={cn(
              "money text-2xl font-bold",
              clinicNet < 0 ? "text-destructive" : "text-foreground",
            )}
          >
            {formatIQD(clinicNet)}
          </p>
          <p className="text-muted-foreground text-xs">
            مصروفات الشهر: <span className="money">{formatIQD(result.monthExpenses)}</span>
          </p>
        </CardContent>
      </Card>

      {/* حالة الإقفال: شارة مُقفل + ملاحظة التقادم + إعادة الفتح + صرف الحصص. */}
      {result.anyClosed || result.anyStale ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              حالة الإقفال
              {result.anyClosed ? (
                <Badge variant="secondary">{SETTLEMENT_STATUS_LABELS.closed}</Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {result.anyStale ? (
              <Alert>
                <AlertTriangle />
                <AlertTitle>الحصيلة قديمة</AlertTitle>
                <AlertDescription>تغيّرت بيانات شهر مُقفل — أعد الإقفال.</AlertDescription>
              </Alert>
            ) : null}

            {result.anyPaid ? (
              <Alert>
                <CircleCheckBig />
                <AlertTitle>تم تسجيل صرف حصة</AlertTitle>
                <AlertDescription>
                  حُفظت الحركة النقدية، لذلك لا يمكن إعادة فتح الشهر أو إعادة إقفاله.
                </AlertDescription>
              </Alert>
            ) : null}

            {canReopen ? (
              <form action={reopenAction}>
                <input type="hidden" name="period" value={period} />
                <SubmitButton
                  variant="outline"
                  className="h-11"
                  pendingText="جارٍ إعادة الفتح…"
                >
                  <Unlock data-icon="inline-start" />
                  إعادة فتح الشهر
                </SubmitButton>
              </form>
            ) : null}

            {payoutDoctors.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">تسجيل صرف الحصص</p>
                <ul className="divide-y rounded-lg border">
                  {payoutDoctors.map((d) => (
                    <li
                      key={d.doctorId}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                    >
                      <span className="text-sm font-medium">{d.doctorName}</span>
                      <span className="money text-sm font-semibold">
                        {formatIQD(d.payout)}
                      </span>
                      {d.paidAt ? (
                        <Badge variant="secondary">تم الصرف</Badge>
                      ) : (
                        <PayoutDialog
                          period={period}
                          doctorId={d.doctorId}
                          doctorName={d.doctorName}
                          payout={d.payout}
                          today={today}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function PayoutDialog({
  period,
  doctorId,
  doctorName,
  payout,
  today,
}: {
  period: string;
  doctorId: number;
  doctorName: string;
  payout: number;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<PayoutState, FormData>(
    markPaid,
    {},
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" className="h-11 whitespace-nowrap">
            تسجيل الصرف
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>صرف حصة — {doctorName}</DialogTitle>
          <DialogDescription>
            سيُسجَّل المبلغ المعتمد {formatIQD(payout)} كحركة نقدية صادرة لشهر{" "}
            {formatPeriodAr(period)}. لا يمكن تسجيل الصرف مرتين.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="period" value={period} />
          <input type="hidden" name="doctorId" value={doctorId} />

          <FieldGroup>
            <Field data-invalid={Boolean(state.error)}>
              <FieldLabel htmlFor={`pay-date-${doctorId}`}>تاريخ الصرف</FieldLabel>
              <Input
                id={`pay-date-${doctorId}`}
                name="date"
                type="date"
                defaultValue={today}
                className="h-11"
                aria-invalid={Boolean(state.error)}
                autoFocus
              />
              <FieldError>{state.error}</FieldError>
            </Field>
          </FieldGroup>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose
              render={
                <Button type="button" variant="outline" className="h-11">
                  إلغاء
                </Button>
              }
            />
            <Button type="submit" className="h-11" disabled={pending || state.ok}>
              {pending ? "جارٍ الحفظ…" : "حفظ الصرف"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
