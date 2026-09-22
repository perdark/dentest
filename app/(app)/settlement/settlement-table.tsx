"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CircleCheckBig, Lock, Unlock } from "lucide-react";
import type { SettlementResult, DoctorSettlement } from "@/lib/settlement";
import {
  calculateDoctorPayout,
  normalizeCommissionPct,
  payoutShortfall,
} from "@/lib/settlement-math";
import { formatIQD } from "@/lib/format";
import { formatPeriodAr, EARLIEST_RECORD_DATE } from "@/lib/dates";
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
import { useActionToast } from "@/components/forms/use-action-toast";
import {
  closeMonth,
  reopenMonth,
  markPaid,
  type CloseState,
  type PayoutState,
} from "@/lib/actions/settlement";

const CLOSE_FORM_ID = "settlement-close-form";

/**
 * «الحصة» answers the only question the owner opens this screen to ask —
 * what do I pay this doctor. It gets its own tinted, ruled column so the eye
 * lands on it before it reads anything else in the row. [presentation only]
 */
const PAYOUT_COL = "border-primary/30 bg-primary/5 border-s";

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
  // دخل الأشعة يدخل الصافي كاملاً: لم تُقتطع منه حصة لأي طبيب. [D9]
  const clinicNet =
    totalCollected + result.xrayIncome - liveTotalPayout - result.monthExpenses;

  const canClose = !result.anyClosed && !result.anyPaid;
  const canReopen = (result.anyClosed || result.anyStale) && !result.anyPaid;
  const payoutDoctors = result.doctors.filter(
    (d) => d.status === "closed" && d.payout > 0,
  );
  // من تجاوزت كلفة مختبره حصته — فرق يُسوّى بالورقة والقلم، فيُرفع فوق الجدول
  // بدل أن يبقى سطراً صغيراً داخل خانة. [عرض فقط]
  const shortfalls = result.doctors
    .map((d) => ({ id: d.doctorId, name: d.doctorName, amount: shortfallFor(d) }))
    .filter((s) => s.amount > 0);

  return (
    <div className="flex flex-col gap-4">
      {/* النموذج الذي يحمل النِّسَب — يُرسَل إلى closeMonth عند تأكيد الإقفال. */}
      <form id={CLOSE_FORM_ID} action={closeAction} className="flex flex-col gap-4">
        <input type="hidden" name="period" value={period} />

        {shortfalls.length > 0 ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle className="text-base font-semibold">
              تسوية يدوية مطلوبة
            </AlertTitle>
            <AlertDescription className="text-destructive/90 text-sm">
              <span className="block">كلفة المختبر تجاوزت حصة الشهر عند:</span>
              <ul className="my-1 flex flex-col gap-0.5">
                {shortfalls.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">{s.name}</span>
                    <span className="money font-bold">{formatIQD(s.amount)}</span>
                  </li>
                ))}
              </ul>
              <span className="block">
                الفرق يُسوّى يدوياً خارج البرنامج — لا يُخصم من أي حصة هنا.
              </span>
            </AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الطبيب</TableHead>
                  {/* الدِّلاء الثلاثة تفصيل لـ«إجمالي المحصّل»: تُطوى على الشاشات
                      الضيّقة فقط، وتعود كاملة على شاشة العيادة. لا رقم يُحذف. */}
                  <TableHead className="hidden text-end md:table-cell">محصّل زراعة</TableHead>
                  <TableHead className="hidden text-end md:table-cell">محصّل تقويم</TableHead>
                  <TableHead className="hidden text-end md:table-cell">محصّل عادي</TableHead>
                  <TableHead className="text-end">إجمالي المحصّل</TableHead>
                  <TableHead className="text-end">
                    العمل المنجز
                    <span className="text-muted-foreground block text-xs font-normal">
                      يُحتسب عند فتح الحالة
                    </span>
                  </TableHead>
                  <TableHead className="text-center">النسبة %</TableHead>
                  <TableHead className={cn(PAYOUT_COL, "text-end text-base font-bold")}>
                    الحصة
                  </TableHead>
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
                        <TableCell className="money hidden text-end md:table-cell">
                          {formatIQD(d.collectedImplant)}
                        </TableCell>
                        <TableCell className="money hidden text-end md:table-cell">
                          {formatIQD(d.collectedOrtho)}
                        </TableCell>
                        <TableCell className="money hidden text-end md:table-cell">
                          {formatIQD(d.collectedNormal)}
                        </TableCell>
                        <TableCell className="money text-end font-semibold">
                          {formatIQD(d.collectedTotal)}
                        </TableCell>
                        {/* «العمل المنجز» مال حقيقي يُسأل عنه — لا يُخفَّت. */}
                        <TableCell className="money text-end">
                          {formatIQD(d.accruedTotal)}
                        </TableCell>
                        <TableCell className="text-center">
                          {closed ? (
                            <span className="text-base font-semibold tabular-nums">
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
                        <TableCell
                          className={cn(PAYOUT_COL, "money text-end align-top")}
                        >
                          <span className="text-base font-bold">
                            {formatIQD(payoutFor(d))}
                          </span>
                          {/* نقص المختبر مال يُسوّى بيد الموظف خارج البرنامج —
                              يُقرأ بحجم كامل مع أيقونة، لا بأصغر خط في الصفحة. */}
                          {shortfallFor(d) > 0 ? (
                            <span className="text-destructive border-destructive/40 bg-destructive/10 ms-auto mt-1.5 flex w-fit max-w-60 items-start gap-1.5 rounded-md border px-2 py-1 text-start text-sm font-medium whitespace-normal">
                              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                              <span>
                                المختبر يزيد{" "}
                                <span className="money font-bold">
                                  {formatIQD(shortfallFor(d))}
                                </span>{" "}
                                عن الحصة — يُسوّى يدوياً
                              </span>
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
                  <TableCell className="money hidden text-end md:table-cell">
                    {formatIQD(sumImplant)}
                  </TableCell>
                  <TableCell className="money hidden text-end md:table-cell">
                    {formatIQD(sumOrtho)}
                  </TableCell>
                  <TableCell className="money hidden text-end md:table-cell">
                    {formatIQD(sumNormal)}
                  </TableCell>
                  <TableCell className="money text-end font-bold">
                    {formatIQD(totalCollected)}
                  </TableCell>
                  <TableCell className="money text-end">
                    {formatIQD(sumAccrued)}
                  </TableCell>
                  {/* عمود النسبة لا يُجمع — النِّسَب مئوية لكل طبيب على حدة. */}
                  <TableCell />

                  <TableCell
                    className={cn(PAYOUT_COL, "money text-end text-base font-bold")}
                  >
                    {formatIQD(liveTotalPayout)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        {canClose ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <p className="text-muted-foreground me-auto text-sm">
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
                    يُجمّد الإقفال النِّسَب والحصص والمبالغ المُحصّلة كما هي الآن،
                    ويمكنك إعادة فتح الشهر لاحقاً.
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
            إجمالي المحصّل
            {result.xrayIncome !== 0 ? " + دخل الأشعة" : ""} − إجمالي الحصص −
            مصروفات الشهر
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {/* الأرقام التي يخرج منها الصافي: يقرؤها المالك قبل النتيجة نفسها،
              فهي رقم مالي لا حاشية — لا تُخفَّت ولا تصغُر.
              ⚠️ الطارح مُلوَّن كهرمانياً (مو أحمر) ليُقرأ «خارج» بلا ما يُقرأ
              «خطأ» — نفس قرار بطاقة ملف الطبيب 2026-08-27. `text-destructive`
              يبقى محجوزاً للصافي السالب وحده، وإلا ضاعت الخسارة الحقيقية بين
              مصروفات طبيعية بنفس اللون. */}
          <p className="money text-base font-medium">
            {formatIQD(totalCollected)}
            {result.xrayIncome !== 0 ? ` + ${formatIQD(result.xrayIncome)}` : ""}{" "}
            <span className="text-amber-700 dark:text-amber-500">
              − {formatIQD(liveTotalPayout)}
            </span>{" "}
            <span className="text-amber-700 dark:text-amber-500">
              − {formatIQD(result.monthExpenses)}
            </span>
          </p>
          <p
            className={cn(
              "money text-3xl font-bold",
              clinicNet < 0 ? "text-destructive" : "text-foreground",
            )}
          >
            {formatIQD(clinicNet)}
          </p>
          {/* السالب لا يُفهم من اللون وحده. */}
          {clinicNet < 0 ? (
            <p className="text-destructive text-sm font-medium">
              الصافي بالسالب — الحصص والمصروفات تجاوزت المُحصَّل هذا الشهر.
            </p>
          ) : null}
          <p className="text-sm">
            <span className="text-muted-foreground">مصروفات الشهر: </span>
            <span className="money text-amber-700 font-semibold dark:text-amber-500">
              − {formatIQD(result.monthExpenses)}
            </span>
          </p>
          {result.xrayIncome !== 0 ? (
            <p className="text-sm">
              <span className="text-muted-foreground">دخل الأشعة: </span>
              <span className="money font-semibold">{formatIQD(result.xrayIncome)}</span>{" "}
              <span className="text-muted-foreground">
                — للعيادة بالكامل، ولا يدخل في حصة أي طبيب.
              </span>
            </p>
          ) : null}
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
                <AlertTitle>تم صرف حصة</AlertTitle>
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
                <p className="text-base font-semibold">صرف الحصص</p>
                <ul className="divide-y rounded-lg border">
                  {payoutDoctors.map((d) => (
                    <li
                      key={d.doctorId}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                    >
                      <span className="text-base font-medium">{d.doctorName}</span>
                      <span className="money text-base font-bold">
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

  useActionToast(
    state,
    `تم صرف حصة ${doctorName}`,
    useCallback(() => setOpen(false), []),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" className="h-11 whitespace-nowrap">
            صرف الحصة
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>صرف حصة — {doctorName}</DialogTitle>
          <DialogDescription>
            سيُحفظ المبلغ المعتمد {formatIQD(payout)} كحركة نقدية صادرة لشهر{" "}
            {formatPeriodAr(period)}. لا يمكن الصرف مرتين.
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
                min={EARLIEST_RECORD_DATE}
                max={today}
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
