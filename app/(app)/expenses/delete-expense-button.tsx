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
import { deleteExpenseAction, type ExpenseFormState } from "@/lib/actions/expenses";

/**
 * حذف مصروف. الحذف كان يقع بضغطة واحدة بلا سؤال وبلا تأكيد بعده — سطر مال
 * يختفي من الشهر دون أن يعرف أحد أنه اختفى. الآن: تأكيد قبله، ورسالة بعده.
 */
export function DeleteExpenseButton({
  id,
  amount,
  category,
  expenseDate,
}: {
  id: number;
  amount: number;
  category: string;
  expenseDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ExpenseFormState, FormData>(
    deleteExpenseAction,
    {},
  );

  useActionToast(
    state,
    "تم حذف المصروف",
    useCallback(() => setOpen(false), []),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive size-11"
            aria-label={`حذف مصروف ${category}`}
          >
            <Trash2 className="size-4" />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>حذف مصروف</DialogTitle>
          <DialogDescription>
            سيُحذف مصروف {category} بمبلغ{" "}
            <span className="money">{formatIQD(amount)}</span> بتاريخ{" "}
            {formatDateAr(expenseDate)}. يبقى الحذف مسجّلاً في سجل التعديلات.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={id} />

          <FormError>{state.error}</FormError>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose
              render={
                <Button type="button" variant="outline" className="h-11">
                  تراجع
                </Button>
              }
            />
            <Button type="submit" variant="destructive" className="h-11" disabled={pending}>
              {pending ? "جارٍ الحذف…" : "تأكيد الحذف"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
