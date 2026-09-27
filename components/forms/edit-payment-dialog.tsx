"use client";

import { useActionState, useCallback, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { FormError } from "@/components/forms/form-error";
import { EARLIEST_RECORD_DATE } from "@/lib/dates";
import { PAYMENT_KIND_LABELS } from "@/lib/strings";
import { updatePaymentAction, type VoidState } from "@/lib/actions/payments";

/**
 * تصحيح دفعة أُدخلت بمبلغ أو تاريخ خاطئ. نوع الدفعة يبقى كما هو — دفعة بنوع
 * خاطئ تُحذف وتُضاف من جديد. الاسترجاع يُكتب بمقداره، وإشارته تبقى سالبة.
 */
export function EditPaymentDialog({
  paymentId,
  amount,
  kind,
  paidDate,
  note,
  today,
  patientName,
}: {
  paymentId: number;
  amount: number;
  kind: string;
  paidDate: string;
  note: string | null;
  today: string;
  patientName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [state, formAction] = useActionState<VoidState, FormData>(updatePaymentAction, {});

  useActionToast(state, "تم تعديل الدفعة", useCallback(() => setOpen(false), []));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setFormKey((k) => k + 1);
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground size-11"
            aria-label={patientName ? `تعديل دفعة ${patientName}` : "تعديل الدفعة"}
          />
        }
      >
        <Pencil className="size-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>تعديل الدفعة</DialogTitle>
          <DialogDescription>
            {patientName ? `${patientName} — ` : ""}
            {PAYMENT_KIND_LABELS[kind] ?? kind}. التعديل يُحفظ في «سجل التعديلات».
          </DialogDescription>
        </DialogHeader>

        <form key={formKey} action={formAction} className="space-y-3">
          <input type="hidden" name="paymentId" value={paymentId} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`pe-amount-${paymentId}`}>المبلغ</Label>
              <Input
                id={`pe-amount-${paymentId}`}
                name="amount"
                inputMode="numeric"
                required
                className="h-11 text-base tabular-nums"
                defaultValue={String(Math.abs(amount))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`pe-date-${paymentId}`}>التاريخ</Label>
              <Input
                id={`pe-date-${paymentId}`}
                name="paidDate"
                type="date"
                required
                className="h-11"
                defaultValue={paidDate}
                min={EARLIEST_RECORD_DATE}
                max={today}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`pe-note-${paymentId}`}>ملاحظة (اختياري)</Label>
            <Input
              id={`pe-note-${paymentId}`}
              name="note"
              maxLength={500}
              autoComplete="off"
              className="h-11"
              defaultValue={note ?? ""}
            />
          </div>

          <FormError>{state.error}</FormError>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <DialogClose render={<Button type="button" variant="outline" className="h-11" />}>
              إلغاء
            </DialogClose>
            <SubmitButton className="h-11">حفظ التعديل</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
