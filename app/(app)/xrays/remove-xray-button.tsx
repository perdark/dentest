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
import { formatIQD } from "@/lib/format";
import { formatDateAr } from "@/lib/dates";
import { removeXrayAction, type XrayFormState } from "@/lib/actions/xrays";

/**
 * حذف صورة أشعة مُسجّلة بالخطأ.
 *
 * الصورة التي استُلمت عليها فلوس لا تُحذف من هنا: النقد حدث حقيقي، وإلغاؤه
 * مكانه الدفتر اليومي حتى ينطرح من مجموع اليوم ويبقى أثره في سجل التعديلات.
 * لذلك النافذة تشرح الترتيب بدل أن تعطي زراً يفشل.
 */
export function RemoveXrayButton({
  caseId,
  patientName,
  treatment,
  openedDate,
  paid,
}: {
  caseId: number;
  patientName: string;
  treatment: string;
  openedDate: string;
  paid: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<XrayFormState, FormData>(
    removeXrayAction,
    {},
  );
  const hasPayments = paid !== 0;

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
            aria-label={`حذف ${treatment} — ${patientName}`}
          >
            <Trash2 className="size-4" />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>حذف أشعة</DialogTitle>
          <DialogDescription>
            {hasPayments ? (
              <>
                على هذه الأشعة دفعة مُسجّلة قدرها{" "}
                <span className="money">{formatIQD(paid)}</span>. ألغِ الدفعة أولاً من
                «الدفتر اليومي» بتاريخ الدفع، بعدها تكدر تحذف السجل من هنا.
              </>
            ) : (
              <>
                سيُحذف سجل {treatment} للمريض {patientName} بتاريخ{" "}
                {formatDateAr(openedDate)}. لا توجد عليه أي دفعة، ويبقى الحذف مسجّلاً في
                «سجل التعديلات».
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="caseId" value={caseId} />

          {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose
              render={
                <Button type="button" variant="outline" className="h-11">
                  {hasPayments ? "حسناً" : "تراجع"}
                </Button>
              }
            />
            {hasPayments ? null : (
              <Button type="submit" variant="destructive" className="h-11" disabled={pending}>
                {pending ? "جارٍ الحذف…" : "تأكيد الحذف"}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
