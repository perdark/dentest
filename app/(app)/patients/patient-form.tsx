"use client";

import { useActionState, useCallback, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/forms/native-select";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionToast } from "@/components/forms/use-action-toast";
import { FormError } from "@/components/forms/form-error";
import type { Patient } from "@/lib/db/schema";

/** ما يحتاجه الـ select فقط، لا صف الطبيب كاملاً. */
export type DoctorOption = { id: number; name: string; isActive: boolean };
import {
  MEDICAL_FLAGS,
  MEDICAL_FLAG_LABELS,
  parseMedicalFlags,
} from "@/lib/strings";
import {
  createPatientAction,
  updatePatientAction,
  type PatientFormState,
} from "@/lib/actions/patients";

export function PatientForm({
  mode = "create",
  patient,
  doctors,
}: {
  mode?: "create" | "edit";
  patient?: Patient;
  /** الأطباء المفعّلون — تأتي من الخادم لأن هذا مكوّن عميل. */
  doctors: DoctorOption[];
}) {
  const isEdit = mode === "edit";
  const [state, formAction] = useActionState<PatientFormState, FormData>(
    isEdit ? updatePatientAction : createPatientAction,
    {},
  );
  const [open, setOpen] = useState(false);
  const checkedFlags = new Set<string>(parseMedicalFlags(patient?.medicalFlags));

  // كل تنفيذ ناجح يُرجع كائن حالة جديد، فيُغلق الحوار ويُظهر التأكيد مرة واحدة.
  useActionToast(
    state,
    isEdit ? "تم حفظ تعديلات المريض" : "تمت إضافة المريض بنجاح",
    useCallback(() => setOpen(false), []),
  );

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
            <Label htmlFor="patient-phone">رقم الهاتف (اختياري)</Label>
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

          {/* الطبيب المسؤول — مطلوب. الخيار الفارغ معطّل لا محذوف: لو حُذف
              لاختار المتصفّح أول طبيب في القائمة تلقائياً، فيُحفظ مريض باسم
              طبيب لم يخترْه أحد. الطبيب المعالج لكل حالة يبقى مأخوذاً من
              الحالة نفسها لا من هنا. */}
          <div className="space-y-1.5">
            <Label htmlFor="patient-doctorId">الطبيب المسؤول</Label>
            <NativeSelect
              id="patient-doctorId"
              name="doctorId"
              required
              defaultValue={patient?.doctorId ? String(patient.doctorId) : ""}
            >
              <option value="" disabled>
                اختر الطبيب
              </option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.isActive ? d.name : `${d.name} (غير مفعّل)`}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="patient-address">العنوان (اختياري)</Label>
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
            <Label htmlFor="patient-notes">ملاحظات (اختياري)</Label>
            <Textarea
              id="patient-notes"
              name="notes"
              defaultValue={patient?.notes ?? ""}
              placeholder="ملاحظات إضافية عن المريض"
            />
          </div>

          {/* الحالة الصحية — تُقرأ قبل أي علاج، فتظهر مع اسم المريض في كل شاشة. */}
          <div className="space-y-2">
            <Label>الحالة الصحية</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MEDICAL_FLAGS.map((key) => (
                <div
                  key={key}
                  className="border-input flex h-11 items-center gap-2 rounded-lg border px-3"
                >
                  <Checkbox
                    id={`patient-mf-${key}`}
                    name="medicalFlags"
                    value={key}
                    defaultChecked={checkedFlags.has(key)}
                  />
                  <Label
                    htmlFor={`patient-mf-${key}`}
                    className="cursor-pointer text-sm font-normal"
                  >
                    {MEDICAL_FLAG_LABELS[key]}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="patient-medicalNotes">تفاصيل الحالة الصحية (اختياري)</Label>
            <Textarea
              id="patient-medicalNotes"
              name="medicalNotes"
              defaultValue={patient?.medicalNotes ?? ""}
              placeholder="أدوية، نوع الحساسية، ملاحظات للطبيب…"
            />
          </div>

          <FormError>{state.error}</FormError>

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
