"use client";

import { useActionState, useCallback, useState } from "react";
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
import { useActionToast } from "@/components/forms/use-action-toast";
import { FormError } from "@/components/forms/form-error";
import { formatIQD } from "@/lib/format";
import { formatDateAr } from "@/lib/dates";
import { voidPayment, type VoidState } from "@/lib/actions/payments";

/**
 * إلغاء تسجيل دفعة خاطئ. يُستخدم لتصحيح خطأ الإدخال فقط — أما إعادة المال
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

  useActionToast(
    state,
    "تم إلغاء التسجيل",
    useCallback(() => setOpen(false), []),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive size-11"
            aria-label="إلغاء التسجيل"
          >
            <Trash2 className="size-4" />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إلغاء تسجيل خاطئ</DialogTitle>
          <DialogDescription>
            سيُحذف تسجيل <span className="money">{formatIQD(amount)}</span>
            {patientName ? ` الخاص بـ ${patientName}` : ""} بتاريخ{" "}
            {formatDateAr(paidDate)}. يُستخدم هذا لتصحيح خطأ إدخال فقط — إذا
            أعدتِ المبلغ للمريض فعلاً فسجّليه بنوع «استرجاع» بدلاً من ذلك.
            التسجيل يبقى محفوظاً في سجل التعديلات.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="paymentId" value={paymentId} />

          <FormError>{state.error}</FormError>

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
