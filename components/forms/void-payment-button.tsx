"use client";

import { useActionState, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatIQD } from "@/lib/format";
import { formatDateAr } from "@/lib/dates";
import { voidPayment, type VoidState } from "@/lib/actions/payments";

/**
 * إلغاء قيد دفعة خاطئ. يُستخدم لتصحيح خطأ الإدخال فقط — أما إعادة المال
 * للمريض فعلاً فتُسجَّل بنوع «استرجاع». [A1]
 */
export function VoidPaymentButton({
  paymentId,
  amount,
  paidDate,
  patientName,
}: {
  paymentId: number;
  amount: number;
  paidDate: string;
  patientName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<VoidState, FormData>(
    voidPayment,
    {},
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- useActionState resolves after the submit event.
    if (state.ok) setOpen(false);
  }, [state.ok]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive size-11"
            aria-label="إلغاء القيد"
          >
            <Trash2 className="size-4" />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إلغاء قيد خاطئ</DialogTitle>
          <DialogDescription>
            سيُحذف قيد <span className="money">{formatIQD(amount)}</span>
            {patientName ? ` الخاص بـ ${patientName}` : ""} بتاريخ{" "}
            {formatDateAr(paidDate)}. يُستخدم هذا لتصحيح خطأ إدخال فقط — إذا
            أعدتِ المبلغ للمريض فعلاً فسجّليه بنوع «استرجاع» بدلاً من ذلك.
            القيد يبقى محفوظاً في سجل التعديلات.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="paymentId" value={paymentId} />

          {state.error ? (
            <p className="text-destructive text-sm">{state.error}</p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose
              render={
                <Button type="button" variant="outline" className="h-11">
                  تراجع
                </Button>
              }
            />
            <Button
              type="submit"
              variant="destructive"
              className="h-11"
              disabled={pending}
            >
              {pending ? "جارٍ الإلغاء…" : "تأكيد الإلغاء"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
