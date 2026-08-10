"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { NativeSelect } from "@/components/forms/native-select";
import { SubmitButton } from "@/components/forms/submit-button";
import { createOrthoCase, type OrthoFormState } from "@/lib/actions/ortho";

type DoctorOption = { id: number; name: string };

export function NewOrthoCaseDialog({
  doctors,
  defaultDoctorId,
  today,
}: {
  doctors: DoctorOption[];
  defaultDoctorId: number | null;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<OrthoFormState, FormData>(
    createOrthoCase,
    {},
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="h-11 gap-2">
            <Plus className="size-4" />
            حالة تقويم جديدة
          </Button>
        }
      />
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>حالة تقويم جديدة</DialogTitle>
          <DialogDescription>
            سجّل المريض والمبلغ المتفق عليه والمقدمة والموعد القادم.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="patientName">اسم المريض</Label>
              <Input
                id="patientName"
                name="patientName"
                required
                autoComplete="off"
                className="h-11"
                placeholder="الاسم الكامل"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">رقم الهاتف (اختياري)</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                className="h-11"
                placeholder="07XXXXXXXXX"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doctorId">الطبيب</Label>
              <NativeSelect
                id="doctorId"
                name="doctorId"
                defaultValue={defaultDoctorId ?? undefined}
              >
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="total">الإجمالي المتفق عليه</Label>
              <Input
                id="total"
                name="total"
                inputMode="numeric"
                required
                className="h-11"
                placeholder="مثال: 1,500,000"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="discount">الخصم</Label>
              <Input
                id="discount"
                name="discount"
                inputMode="numeric"
                className="h-11"
                placeholder="0"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="downPayment">المقدمة</Label>
              <Input
                id="downPayment"
                name="downPayment"
                inputMode="numeric"
                className="h-11"
                placeholder="0"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="openedDate">التاريخ</Label>
              <Input
                id="openedDate"
                name="openedDate"
                type="date"
                defaultValue={today}
                className="h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nextAppointment">الموعد القادم (اختياري)</Label>
              <Input
                id="nextAppointment"
                name="nextAppointment"
                type="date"
                className="h-11"
              />
            </div>
          </div>

          {state.error ? (
            <p className="text-destructive text-sm">{state.error}</p>
          ) : null}

          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" className="h-11">
                  إلغاء
                </Button>
              }
            />
            <SubmitButton className="h-11">حفظ الحالة</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
