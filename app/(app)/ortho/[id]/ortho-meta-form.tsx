"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionToast } from "@/components/forms/use-action-toast";
import { FormError } from "@/components/forms/form-error";
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
  // هذا النموذج كان يكرّر منطق `useActionToast` بيده. نسخة واحدة من القاعدة
  // تعني أن أي تصحيح فيها يصل كل شاشة، لا الشاشات التي تذكّرنا بها.
  useActionToast(state, "تم حفظ الموعد والملاحظة بنجاح");

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
        <p className="text-muted-foreground text-sm">اتركه فارغًا لإلغاء الموعد.</p>
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

      <FormError>{state.error}</FormError>

      <SubmitButton className="h-11 w-full">حفظ التحديثات</SubmitButton>
    </form>
  );
}
