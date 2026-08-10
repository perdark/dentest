"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/forms/submit-button";
import type { Patient } from "@/lib/db/schema";
import {
  createPatientAction,
  updatePatientAction,
  type PatientFormState,
} from "@/lib/actions/patients";

export function PatientForm({
  mode = "create",
  patient,
}: {
  mode?: "create" | "edit";
  patient?: Patient;
}) {
  const isEdit = mode === "edit";
  const [state, formAction] = useActionState<PatientFormState, FormData>(
    isEdit ? updatePatientAction : createPatientAction,
    {},
  );
  const [open, setOpen] = useState(false);

  // كل تنفيذ ناجح يُرجع كائن حالة جديد، فيُغلق الحوار مرة واحدة فقط.
  useEffect(() => {
    if (state.ok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- useActionState resolves after the submit event.
      setOpen(false);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          isEdit ? (
            <Button variant="outline" className="h-11" />
          ) : (
            <Button className="h-11" />
          )
        }
      >
        {isEdit ? <Pencil /> : <Plus />}
        {isEdit ? "تعديل" : "إضافة مريض"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل بيانات المريض" : "إضافة مريض جديد"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "حدّث بيانات المريض ثم احفظ التغييرات."
              : "أدخل بيانات المريض. الاسم مطلوب وبقية الحقول اختيارية."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          {isEdit && patient ? (
            <input type="hidden" name="id" defaultValue={patient.id} />
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="patient-fullName">الاسم الكامل</Label>
            <Input
              id="patient-fullName"
              name="fullName"
              required
              defaultValue={patient?.fullName ?? ""}
              autoComplete="off"
              className="h-11"
              placeholder="اسم المريض"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="patient-phone">رقم الهاتف</Label>
            <Input
              id="patient-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              dir="ltr"
              defaultValue={patient?.phone ?? ""}
              autoComplete="off"
              className="h-11 text-start"
              placeholder="07XXXXXXXXX"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="patient-address">العنوان</Label>
            <Input
              id="patient-address"
              name="address"
              defaultValue={patient?.address ?? ""}
              autoComplete="off"
              className="h-11"
              placeholder="المدينة / المنطقة"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="patient-notes">ملاحظات</Label>
            <Textarea
              id="patient-notes"
              name="notes"
              defaultValue={patient?.notes ?? ""}
              placeholder="ملاحظات إضافية (اختياري)"
            />
          </div>

          {state.error ? (
            <p className="text-destructive text-sm" role="alert">
              {state.error}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" className="h-11" />}>
              إلغاء
            </DialogClose>
            <SubmitButton className="h-11">{isEdit ? "حفظ التغييرات" : "إضافة"}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
