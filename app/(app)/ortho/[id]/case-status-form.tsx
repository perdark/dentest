"use client";

import { useActionState, useCallback, useState } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionToast } from "@/components/forms/use-action-toast";
import { FormError } from "@/components/forms/form-error";
import { setOrthoStatus, type OrthoFormState } from "@/lib/actions/ortho";

/**
 * إغلاق حالة التقويم وإعادة فتحها.
 *
 * التقويم بلا إجمالي متفق عليه، فلا شيء يُغلق الحالة من نفسه: تبقى «مفتوح» حتى
 * تقول العيادة إنها انتهت. الإغلاق قرار قابل للتراجع ولا يمسّ ما حُصِّل.
 * [قرار العيادة 2026-08-25]
 */
export function OrthoStatusButton({
  caseId,
  status,
  patientName,
}: {
  caseId: number;
  status: string;
  patientName: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<OrthoFormState, FormData>(
    setOrthoStatus,
    {},
  );
  const closing = status === "open";

  useActionToast(
    state,
    closing ? "تم إغلاق الحالة" : "تمت إعادة فتح الحالة",
    useCallback(() => setOpen(false), []),
  );

  // حالة ملغاة لا تُغلق ولا تُفتح من هنا — الإلغاء قرار آخر.
  if (status === "cancelled") return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" className="h-11 gap-2">
            {closing ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <RotateCcw className="size-4" />
            )}
            {closing ? "إغلاق الحالة" : "إعادة فتح الحالة"}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {closing ? "إغلاق حالة التقويم" : "إعادة فتح حالة التقويم"}
          </DialogTitle>
          <DialogDescription>
            {closing
              ? `ستُغلق حالة ${patientName} فلا تُضاف إليها جلسات جديدة. ما حُصِّل يبقى كما هو في الحصيلة وفي السجل، ويمكن إعادة فتحها في أي وقت.`
              : `ستُفتح حالة ${patientName} من جديد ويمكن إضافة الجلسات إليها.`}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="caseId" value={caseId} />
          <input
            type="hidden"
            name="status"
            value={closing ? "completed" : "open"}
          />

          <FormError>{state.error}</FormError>

          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" className="h-11">
                  إلغاء
                </Button>
              }
            />
            <SubmitButton className="h-11">
              {closing ? "إغلاق الحالة" : "إعادة الفتح"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
