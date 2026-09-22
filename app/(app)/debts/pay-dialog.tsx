"use client";

import { useActionState, useCallback, useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/forms/native-select";
import { useActionToast } from "@/components/forms/use-action-toast";
import { FormError } from "@/components/forms/form-error";
import { MoneySummary } from "@/components/forms/money-summary";
import { formatIQD, parseAmount } from "@/lib/format";
import { PAYMENT_KIND_LABELS } from "@/lib/strings";
import { recordDebtPayment, type PayState } from "@/lib/actions/debts";
import { EARLIEST_RECORD_DATE } from "@/lib/dates";

/**
 * The two kinds that behave differently, and nothing else.
 *
 * 🔴 «تسوية» and «مقدمة» were removed on 2026-09-22 because neither did
 * anything: no code anywhere branches on them, so both were stored as ordinary
 * money in. «تسوية» was the dangerous one — «الدليل» told the clinic to use it
 * «لتصحيح حساب», and "correcting" a 600,000 over-billing with one instead
 * CREDITED 600,000: cash on hand rose, the doctor's collected total rose, and
 * the payout rose by half of it, on money that never reached the drawer.
 * Correcting a line is `VoidPaymentButton` → `deletePayment`, which is the only
 * clean correction path and says so in `lib/mutations.ts`.
 *
 * «مقدمة» was merely inert here: its cap guards open-ended ortho, which this
 * screen never lists, so it behaved exactly like «جلسة». It is still written by
 * the screens that mean it — a new case's first payment, an implant card, an
 * ortho down payment — and `PAYMENT_KIND_LABELS` still carries both labels so
 * every row ever recorded under them still reads correctly. [2026-09-22]
 */
const PAYMENT_KINDS = ["session", "refund"] as const;
type PaymentKind = (typeof PAYMENT_KINDS)[number];

export function PayDialog({
  caseId,
  patientName,
  remaining,
  today,
}: {
  caseId: number;
  patientName: string;
  remaining: number;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<PaymentKind>("session");
  const [state, formAction, pending] = useActionState<PayState, FormData>(
    recordDebtPayment,
    {},
  );

  // أغلق الحوار وأكّد الإضافة بعد نجاحها. الاسترجاع يُؤكَّد باسمه: التأكيد
  // يُقرأ بعد إغلاق الحوار، ورسالة «تمت إضافة الدفعة» عن استرجاع تقرأ كأن
  // المبلغ دخل. (`toast.success` يسبق `onSuccess`، فالنوع هنا هو المُرسَل.)
  useActionToast(
    state,
    kind === "refund" ? "تم تسجيل الاسترجاع بنجاح" : "تمت إضافة الدفعة بنجاح",
    useCallback(() => {
      setOpen(false);
      setAmount("");
      setKind("session");
    }, []),
  );

  // إغلاق الحوار بلا حفظ يمسح المبلغ المكتوب. بدون هذا كان الرقم المتروك
  // يبقى في الحقل، فتفتح الموظفة الحوار مرة ثانية وتجد مبلغاً جاهزاً لم تكتبه
  // الآن — وتضغط «حفظ الدفعة» عليه.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setAmount("");
      // النوع يعود إلى «جلسة» مع المبلغ: «استرجاع» متروكاً من فتحة سابقة يقلب
      // إشارة الدفعة التالية بلا أن ينتبه أحد.
      setKind("session");
    }
  }

  // الاسترجاع يزيد الرصيد المطلوب بدل أن يُنقصه — نفس ما تفعله طبقة الدفعات.
  const afterPayment =
    remaining + (kind === "refund" ? 1 : -1) * parseAmount(amount);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button variant="outline" className="h-11 whitespace-nowrap" />}
      >
        إضافة دفعة
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إضافة دفعة — {patientName}</DialogTitle>
        </DialogHeader>

        <p className="text-muted-foreground text-sm">
          المتبقي:{" "}
          <span className="money text-foreground font-semibold">
            {formatIQD(remaining)}
          </span>
        </p>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="caseId" value={caseId} />

          <div className="space-y-2">
            <Label htmlFor={`amount-${caseId}`}>المبلغ</Label>
            <Input
              id={`amount-${caseId}`}
              name="amount"
              inputMode="numeric"
              autoComplete="off"
              placeholder="مثال: 50,000"
              className="h-11 text-base tabular-nums"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {parseAmount(amount) !== 0 ? (
              <MoneySummary
                figures={[
                  {
                    label:
                      kind === "refund"
                        ? "المتبقي بعد الاسترجاع"
                        : "المتبقي بعد هذه الدفعة",
                    amount: afterPayment,
                    emphasis: true,
                  },
                ]}
              />
            ) : null}
          </div>

          {/* النوع: «جلسة» في الغالب، ولذلك هو المبدئي. «استرجاع» هو الوحيد
              الذي يزيد الرصيد بدل أن يُنقصه — الطبقة الوسطى تحفظه بالسالب
              وتمنعه من تجاوز ما قُبض فعلاً. */}
          <div className="space-y-2">
            <Label htmlFor={`kind-${caseId}`}>النوع</Label>
            <NativeSelect
              id={`kind-${caseId}`}
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as PaymentKind)}
            >
              {PAYMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {PAYMENT_KIND_LABELS[k]}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`date-${caseId}`}>التاريخ</Label>
            <Input
              id={`date-${caseId}`}
              name="date"
              type="date"
              defaultValue={today}
              min={EARLIEST_RECORD_DATE}
              max={today}
              className="h-11"
            />
          </div>

          <FormError>{state.error}</FormError>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose
              render={<Button type="button" variant="outline" className="h-11" />}
            >
              إلغاء
            </DialogClose>
            <Button type="submit" className="h-11" disabled={pending}>
              {pending ? "جارٍ الحفظ…" : "حفظ الدفعة"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
