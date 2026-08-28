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
import { removeXrayAction, type XrayFormState } from "@/lib/actions/xrays";

/**
 * حذف صورة أشعة مُسجّلة بالخطأ.
 *
 * سعر الصورة نقدٌ دخل الصندوق يوم تسجيلها، فالحذف ينقصه من دخل الأشعة ومن
 * «النقد المتوفر». النافذة تقول ذلك صراحةً قبل التأكيد، والسطر يبقى كاملاً في
 * «سجل التعديلات».
 */
export function RemoveXrayButton({
  filmId,
  treatment,
  filmDate,
  price,
}: {
  filmId: number;
  treatment: string;
  filmDate: string;
  price: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<XrayFormState, FormData>(
    removeXrayAction,
    {},
  );

  useActionToast(
    state,
    "تم حذف الأشعة",
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
            aria-label={`حذف ${treatment} بتاريخ ${formatDateAr(filmDate)}`}
          >
            <Trash2 className="size-4" />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>حذف أشعة</DialogTitle>
          <DialogDescription>
            سيُحذف سجل {treatment} بتاريخ {formatDateAr(filmDate)}، وينقص مبلغ{" "}
            <span className="money">{formatIQD(price)}</span> من دخل الأشعة ومن
            «النقد المتوفر». يبقى الحذف مسجّلاً في «سجل التعديلات».
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="filmId" value={filmId} />

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
