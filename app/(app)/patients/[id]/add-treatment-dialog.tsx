"use client";

import { useActionState, useCallback, useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/forms/native-select";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionToast } from "@/components/forms/use-action-toast";
import { FormError } from "@/components/forms/form-error";
import { MoneySummary } from "@/components/forms/money-summary";
import { ToothMarksPicker } from "@/components/tooth-chart/tooth-marks-picker";
import { parseAmount } from "@/lib/format";
import { EARLIEST_RECORD_DATE } from "@/lib/dates";
import {
  addPatientTreatmentAction,
  type PatientTreatmentState,
} from "@/lib/actions/patients";

/**
 * «إضافة علاج» on the patient file — how the paper notebooks come in.
 *
 * One save opens the treatment, takes what was paid and charts its teeth. The
 * date is free back to `EARLIEST_RECORD_DATE`, so an old patient's fillings go
 * in one after another, each on the day it was really done. Details on the
 * right, the mouth on the left: every filling, session or extraction differs
 * by tooth, and the note for a tooth is written beside that tooth.
 */
export function AddTreatmentDialog({
  patientId,
  patientName,
  doctors,
  defaultDoctorId,
  treatments,
  history,
  today,
}: {
  patientId: number;
  patientName: string;
  doctors: { id: number; name: string }[];
  defaultDoctorId?: number | null;
  treatments: { id: number; nameAr: string }[];
  /** Tooth → how many earlier treatments touched it, drawn behind the chart. */
  history: [number, number][];
  today: string;
}) {
  const [open, setOpen] = useState(false);
  // Remounting the form on every opening clears it, chart included — the
  // next treatment never starts with the last one's teeth ticked.
  const [formKey, setFormKey] = useState(0);
  const [price, setPrice] = useState("");
  const [discount, setDiscount] = useState("0");
  const [paidNow, setPaidNow] = useState("0");
  const [state, formAction] = useActionState<PatientTreatmentState, FormData>(
    addPatientTreatmentAction,
    {},
  );

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setFormKey((k) => k + 1);
      setPrice("");
      setDiscount("0");
      setPaidNow("0");
    }
  }

  useActionToast(state, "تمت إضافة العلاج إلى ملف المريض", useCallback(() => setOpen(false), []));

  const net = Math.max(0, parseAmount(price) - parseAmount(discount));
  const remaining = net - parseAmount(paidNow);
  const doctorDefault =
    defaultDoctorId && doctors.some((d) => d.id === defaultDoctorId)
      ? String(defaultDoctorId)
      : doctors[0]
        ? String(doctors[0].id)
        : "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button className="h-11 gap-1.5" />}>
        <Plus className="size-4" />
        إضافة علاج
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>إضافة علاج — {patientName}</DialogTitle>
          <DialogDescription>
            علاج جديد أو جلسة قديمة من الدفتر: اختر تاريخها الحقيقي، وحدّد
            الأسنان واكتب ملاحظة كل سن عليه.
          </DialogDescription>
        </DialogHeader>

        <form key={formKey} action={formAction} className="space-y-4">
          <input type="hidden" name="patientId" value={patientId} />

          {/* In RTL the first column sits on the right: details there, the
              mouth on the left. Stacked on a phone, details come first. */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="pt-treatment">العلاج</Label>
                <Input
                  id="pt-treatment"
                  name="treatmentName"
                  list="pt-treatment-list"
                  required
                  autoComplete="off"
                  className="h-11"
                  placeholder="حشوة، قلع، تنظيف، جلسة…"
                />
                <datalist id="pt-treatment-list">
                  {treatments.map((t) => (
                    <option key={t.id} value={t.nameAr} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="pt-doctor">الطبيب</Label>
                  <NativeSelect id="pt-doctor" name="doctorId" required defaultValue={doctorDefault}>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pt-date">التاريخ</Label>
                  <Input
                    id="pt-date"
                    name="date"
                    type="date"
                    required
                    className="h-11"
                    defaultValue={today}
                    min={EARLIEST_RECORD_DATE}
                    max={today}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="pt-price">السعر</Label>
                  <Input
                    id="pt-price"
                    name="price"
                    inputMode="numeric"
                    className="h-11 text-base tabular-nums"
                    placeholder="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pt-discount">الخصم</Label>
                  <Input
                    id="pt-discount"
                    name="discount"
                    inputMode="numeric"
                    className="h-11 text-base tabular-nums"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pt-paid">المبلغ المدفوع</Label>
                <Input
                  id="pt-paid"
                  name="paidNow"
                  inputMode="numeric"
                  className="h-11 text-base tabular-nums"
                  value={paidNow}
                  onChange={(e) => setPaidNow(e.target.value)}
                />
              </div>

              {price.trim() ? (
                <MoneySummary
                  figures={[
                    { label: "الصافي", amount: net },
                    { label: "المتبقي", amount: remaining, emphasis: true },
                  ]}
                />
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="pt-notes">ملاحظات (اختياري)</Label>
                <Textarea
                  id="pt-notes"
                  name="notes"
                  maxLength={1000}
                  placeholder="ما جرى في الجلسة، ما يحتاجه المريض بعدها…"
                />
              </div>
            </div>

            <div className="space-y-2 rounded-xl p-3 ring-1 ring-foreground/10">
              <p className="font-medium">الأسنان</p>
              <p className="text-muted-foreground text-sm">
                اضغط على السن لتحديده، فتظهر تحت المخطط خانة السطح وملاحظة هذا
                السن. الضغط عليه مرة ثانية يلغي تحديده. اتركه فارغاً إذا لم يكن
                العلاج على سن بعينه.
              </p>
              <ToothMarksPicker name="marks" history={new Map(history)} />
            </div>
          </div>

          <FormError>{state.error}</FormError>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose render={<Button type="button" variant="outline" className="h-11" />}>
              إلغاء
            </DialogClose>
            <SubmitButton className="h-11">حفظ العلاج</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
