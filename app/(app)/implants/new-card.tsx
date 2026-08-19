"use client";

import { useActionState, useCallback, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/forms/native-select";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionToast } from "@/components/forms/use-action-toast";
import { MoneySummary } from "@/components/forms/money-summary";
import { parseAmount } from "@/lib/format";
import { createImplantCard, type ImplantFormState } from "@/lib/actions/implants";

export function NewCard({
  doctors,
  today,
}: {
  doctors: { id: number; name: string }[];
  today: string;
}) {
  const [open, setOpen] = useState(false);
  // معاينة فقط — الإجمالي النهائي يُحتسب على الخادم. [A3]
  const [price, setPrice] = useState("");
  const [discount, setDiscount] = useState("");
  const [downPayment, setDownPayment] = useState("");
  const net = Math.max(0, parseAmount(price) - parseAmount(discount));
  const remaining = net - parseAmount(downPayment);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<ImplantFormState, FormData>(
    createImplantCard,
    {},
  );

  useActionToast(
    state,
    "تم فتح بطاقة الزراعة بنجاح",
    useCallback(() => {
      setOpen(false);
      formRef.current?.reset();
      // الحقول المتحكَّم بها لا يمسّها form.reset() — تُصفَّر يدوياً وإلا فُتحت
      // البطاقة التالية بأرقام سابقتها.
      setPrice("");
      setDiscount("");
      setDownPayment("");
    }, []),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="h-11">
            <Plus className="size-4" />
            بطاقة زراعة جديدة
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>بطاقة زراعة جديدة</DialogTitle>
          <DialogDescription>
            تُحتسب القيم على الخادم: الإجمالي = السعر الكلي − الخصم.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} action={formAction} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="nc-fullName">اسم المريض</Label>
              <Input id="nc-fullName" name="fullName" required className="h-11" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nc-phone">الهاتف</Label>
              <Input id="nc-phone" name="phone" inputMode="tel" className="h-11" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nc-doctorId">الطبيب</Label>
              <NativeSelect
                id="nc-doctorId"
                name="doctorId"
                defaultValue={doctors[0]?.id ?? ""}
                required
              >
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="nc-address">العنوان</Label>
              <Input id="nc-address" name="address" className="h-11" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nc-price">السعر الكلي (د.ع)</Label>
              <Input
                id="nc-price"
                name="price"
                inputMode="numeric"
                placeholder="0"
                required
                className="h-11"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nc-discount">الخصم (د.ع)</Label>
              <Input
                id="nc-discount"
                name="discount"
                inputMode="numeric"
                placeholder="0"
                className="h-11"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nc-downPayment">المقدمة (د.ع)</Label>
              <Input
                id="nc-downPayment"
                name="downPayment"
                inputMode="numeric"
                placeholder="0"
                className="h-11"
                value={downPayment}
                onChange={(e) => setDownPayment(e.target.value)}
              />
            </div>

            {price !== "" ? (
              <MoneySummary
                figures={[
                  { label: "الصافي", amount: net },
                  { label: "المتبقي", amount: remaining, emphasis: true },
                ]}
              />
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="nc-date">التاريخ</Label>
              <Input
                id="nc-date"
                name="date"
                type="date"
                defaultValue={today}
                className="h-11"
              />
            </div>
          </div>

          {state.error ? (
            <p className="text-destructive text-sm">{state.error}</p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => setOpen(false)}
            >
              إلغاء
            </Button>
            <SubmitButton className="h-11">حفظ البطاقة</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
