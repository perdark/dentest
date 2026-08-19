"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/forms/submit-button";
import { updateOrtho, type OrthoFormState } from "@/lib/actions/ortho";

export function OrthoMetaForm({
  caseId,
  nextAppointment,
  hasComplaint,
  complaintNote,
}: {
  caseId: number;
  nextAppointment: string | null;
  hasComplaint: boolean;
  complaintNote: string | null;
}) {
  const [state, formAction] = useActionState<OrthoFormState, FormData>(
    updateOrtho,
    {},
  );
  const seen = useRef<OrthoFormState | null>(null);

  useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (state.ok) toast.success("تم حفظ الموعد والملاحظة بنجاح");
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="caseId" value={caseId} />

      <div className="space-y-1.5">
        <Label htmlFor="nextAppointment">الموعد القادم</Label>
        <Input
          id="nextAppointment"
          name="nextAppointment"
          type="date"
          defaultValue={nextAppointment ?? ""}
          className="h-11"
        />
        <p className="text-muted-foreground text-xs">اتركه فارغًا لإلغاء الموعد.</p>
      </div>

      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-input px-3">
        <input
          type="checkbox"
          name="hasComplaint"
          defaultChecked={hasComplaint}
          className="accent-primary size-5"
        />
        <span className="text-sm font-medium">ملاحظة مهمة على هذه الحالة</span>
      </label>

      <div className="space-y-1.5">
        <Label htmlFor="complaintNote">نص الملاحظة</Label>
        <Textarea
          id="complaintNote"
          name="complaintNote"
          defaultValue={complaintNote ?? ""}
          rows={3}
          placeholder="سجّل تفاصيل الملاحظة ليكون سجل الحالة كاملاً وموثّقاً."
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}

      <SubmitButton className="h-11 w-full">حفظ التحديثات</SubmitButton>
    </form>
  );
}
