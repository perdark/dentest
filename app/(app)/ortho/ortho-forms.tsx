"use client";

import { useActionState, useCallback, useState } from "react";
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
import { useActionToast } from "@/components/forms/use-action-toast";
import { FormError } from "@/components/forms/form-error";
import { MoneySummary } from "@/components/forms/money-summary";
import { createOrthoCase, type OrthoFormState } from "@/lib/actions/ortho";
import { parseAmount } from "@/lib/format";

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
  const [downPaymentAgreed, setDownPaymentAgreed] = useState("");
  const [downPayment, setDownPayment] = useState("");
  const [state, formAction] = useActionState<OrthoFormState, FormData>(
    createOrthoCase,
    {},
  );
  const agreedAmount = parseAmount(downPaymentAgreed);
  const downAmount = parseAmount(downPayment);

  useActionToast(
    state,
    "تم فتح حالة التقويم بنجاح",
    useCallback(() => {
      setOpen(false);
      setDownPaymentAgreed("");
      setDownPayment("");
    }, []),
  );

  // الإغلاق بلا حفظ يمسح المقدمة المكتوبة، وإلا فُتحت حالة المريض التالي
  // ومقدمة المريض السابق جاهزة في الحقل.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setDownPaymentAgreed("");
      setDownPayment("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
            أضف المريض والمقدمة والموعد القادم — المقدمة تُحدَّد هنا وتُسدَّد على
            دفعات، وكل جلسة تُسعَّر عند إضافتها.
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
                dir="ltr"
                autoComplete="off"
                className="h-11 text-start"
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

            {/* رقمان لا رقم: المتفق عليه شيء، والمقبوض اليوم منه شيء آخر —
                العيادة تتفق على ٢٠٠ ألف وتقبض ٥٠ في اليوم نفسه. */}
            <div className="space-y-1.5">
              <Label htmlFor="downPaymentAgreed">المقدمة المتفق عليها (اختياري)</Label>
              <Input
                id="downPaymentAgreed"
                name="downPaymentAgreed"
                inputMode="numeric"
                className="h-11 text-base tabular-nums"
                placeholder="0"
                value={downPaymentAgreed}
                onChange={(e) => setDownPaymentAgreed(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="downPayment">المقبوض اليوم من المقدمة (اختياري)</Label>
              <Input
                id="downPayment"
                name="downPayment"
                inputMode="numeric"
                className="h-11 text-base tabular-nums"
                placeholder="0"
                value={downPayment}
                onChange={(e) => setDownPayment(e.target.value)}
              />
            </div>

            {agreedAmount > 0 || downAmount > 0 ? (
              <div className="sm:col-span-2">
                <MoneySummary
                  figures={[
                    { label: "المقدمة المتفق عليها", amount: agreedAmount },
                    { label: "المقبوض اليوم", amount: downAmount },
                    {
                      label: "المتبقي من المقدمة",
                      amount: Math.max(0, agreedAmount - downAmount),
                      emphasis: true,
                    },
                  ]}
                />
              </div>
            ) : null}

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

          <FormError>{state.error}</FormError>

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
