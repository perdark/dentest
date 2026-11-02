"use client";

import { useActionState, useCallback, useState } from "react";
import { UserRoundCog } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { NativeSelect } from "@/components/forms/native-select";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionToast } from "@/components/forms/use-action-toast";
import { FormError } from "@/components/forms/form-error";
import { formatIQD } from "@/lib/format";
import { reassignCaseDoctorAction, type CaseEditState } from "@/lib/actions/cases";

/**
 * «تغيير الطبيب» on an implant card or an ortho case. [2026-10-28]
 *
 * The share of every payment on the case follows the case to the new doctor,
 * and the dialog says how much before it is saved — a doctor's monthly share
 * changes with this, so it must never look like a label edit.
 */
export function ChangeDoctorDialog({
  caseId,
  currentDoctorId,
  currentDoctorName,
  doctors,
  paidTotal,
  patientName,
}: {
  caseId: number;
  currentDoctorId: number;
  currentDoctorName: string;
  doctors: { id: number; name: string }[];
  /** What has been collected on the case so far — moves with it. */
  paidTotal: number;
  patientName: string;
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const others = doctors.filter((d) => d.id !== currentDoctorId);
  const [doctorId, setDoctorId] = useState(others[0] ? String(others[0].id) : "");
  const [state, formAction] = useActionState<CaseEditState, FormData>(
    reassignCaseDoctorAction,
    {},
  );

  useActionToast(state, "تم تغيير الطبيب", useCallback(() => setOpen(false), []));

  const target = others.find((d) => String(d.id) === doctorId);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setFormKey((k) => k + 1);
          setDoctorId(others[0] ? String(others[0].id) : "");
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" className="h-11 gap-2" />}>
        <UserRoundCog className="size-4" />
        تغيير الطبيب
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>تغيير طبيب الحالة</DialogTitle>
          <DialogDescription>
            {patientName} — مسجّلة الآن على {currentDoctorName}. يُحفظ التغيير في «سجل
            التعديلات».
          </DialogDescription>
        </DialogHeader>

        {others.length === 0 ? (
          <p className="text-muted-foreground text-sm">لا يوجد طبيب آخر لنقل الحالة إليه.</p>
        ) : (
          <form key={formKey} action={formAction} className="space-y-3">
            <input type="hidden" name="caseId" value={caseId} />
            <div className="space-y-1.5">
              <Label htmlFor={`cd-doctor-${caseId}`}>الطبيب الصحيح</Label>
              <NativeSelect
                id={`cd-doctor-${caseId}`}
                name="doctorId"
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
              >
                {others.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <p className="bg-muted/40 rounded-lg px-3 py-2.5 text-sm leading-relaxed">
              {paidTotal !== 0 ? (
                <>
                  المدفوع على هذه الحالة{" "}
                  <span className="money font-semibold">{formatIQD(paidTotal)}</span> ينتقل
                  مع الحالة إلى {target?.name ?? "الطبيب الجديد"}، فتُحسب حصته منه في كل
                  شهر دُفع فيه. الأشهر المُقفلة التي تتغيّر تحتاج إعادة إقفال.
                </>
              ) : (
                <>لا مدفوع على الحالة بعد — الدفعات القادمة تُحسب للطبيب الجديد.</>
              )}
            </p>

            <FormError>{state.error}</FormError>

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <DialogClose render={<Button type="button" variant="outline" className="h-11" />}>
                إلغاء
              </DialogClose>
              <SubmitButton className="h-11">حفظ الطبيب</SubmitButton>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
