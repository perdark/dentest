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
import { useActionToast } from "@/components/forms/use-action-toast";
import { FormError } from "@/components/forms/form-error";
import { MoneySummary } from "@/components/forms/money-summary";
import { formatIQD, parseAmount } from "@/lib/format";
import { recordDebtPayment, type PayState } from "@/lib/actions/debts";

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
  const [state, formAction, pending] = useActionState<PayState, FormData>(
    recordDebtPayment,
    {},
  );

  // أغلق الحوار وأكّد الإضافة بعد نجاحها.
  useActionToast(
    state,
    "تمت إضافة الدفعة بنجاح",
    useCallback(() => {
      setOpen(false);
      setAmount("");
    }, []),
  );

  // إغلاق الحوار بلا حفظ يمسح المبلغ المكتوب. بدون هذا كان الرقم المتروك
  // يبقى في الحقل، فتفتح الموظفة الحوار مرة ثانية وتجد مبلغاً جاهزاً لم تكتبه
  // الآن — وتضغط «حفظ الدفعة» عليه.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setAmount("");
  }

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
                    label: "المتبقي بعد هذه الدفعة",
                    amount: remaining - parseAmount(amount),
                    emphasis: true,
                  },
                ]}
              />
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={`date-${caseId}`}>التاريخ</Label>
            <Input
              id={`date-${caseId}`}
              name="date"
              type="date"
              defaultValue={today}
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
