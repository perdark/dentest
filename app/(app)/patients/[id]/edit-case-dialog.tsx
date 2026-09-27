"use client";

import { useActionState, useCallback, useState } from "react";
import { Pencil } from "lucide-react";
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
import { parseAmount } from "@/lib/format";
import { EARLIEST_RECORD_DATE } from "@/lib/dates";
import { updateCaseAction, type CaseEditState } from "@/lib/actions/cases";

/**
 * تصحيح علاج عادي أُدخل بالخطأ: اسم العلاج، الطبيب، التاريخ، السعر والخصم.
 * تغيير الطبيب ينقل معه دفعات الحالة التي حُسبت للطبيب السابق. الأسنان تُعدَّل
 * من «المخطط»، والدفعات من جدول «الدفعات».
 */
export function EditCaseDialog({
  caseId,
  treatment,
  doctorId,
  openedDate,
  listPrice,
  discount,
  totalPrice,
  notes,
  paid,
  doctors,
  treatments,
  today,
}: {
  caseId: number;
  treatment: string;
  doctorId: number;
  openedDate: string;
  listPrice: number;
  discount: number;
  totalPrice: number;
  notes: string | null;
  paid: number;
  doctors: { id: number; name: string }[];
  treatments: { id: number; nameAr: string }[];
  today: string;
}) {
  // A case whose saved price and discount no longer add up to its total (an
  // older record) opens on the total itself, so saving untouched changes nothing.
  const consistent = listPrice - discount === totalPrice;
  const initialPrice = String(consistent ? listPrice : totalPrice);
  const initialDiscount = String(consistent ? discount : 0);

  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [price, setPrice] = useState(initialPrice);
  const [disc, setDisc] = useState(initialDiscount);
  const [state, formAction] = useActionState<CaseEditState, FormData>(updateCaseAction, {});

  useActionToast(state, "تم تعديل العلاج", useCallback(() => setOpen(false), []));

  const net = Math.max(0, parseAmount(price) - parseAmount(disc));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setFormKey((k) => k + 1);
          setPrice(initialPrice);
          setDisc(initialDiscount);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground size-11"
            aria-label={`تعديل ${treatment}`}
          />
        }
      >
        <Pencil className="size-4" />
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>تعديل العلاج</DialogTitle>
          <DialogDescription>
            تصحيح ما أُدخل بالخطأ. التعديل يُحفظ في «سجل التعديلات».
          </DialogDescription>
        </DialogHeader>

        <form key={formKey} action={formAction} className="space-y-3">
          <input type="hidden" name="caseId" value={caseId} />

          <div className="space-y-1.5">
            <Label htmlFor={`ce-treatment-${caseId}`}>العلاج</Label>
            <Input
              id={`ce-treatment-${caseId}`}
              name="treatmentName"
              list={`ce-treatment-list-${caseId}`}
              required
              autoComplete="off"
              className="h-11"
              defaultValue={treatment}
            />
            <datalist id={`ce-treatment-list-${caseId}`}>
              {treatments.map((t) => (
                <option key={t.id} value={t.nameAr} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`ce-doctor-${caseId}`}>الطبيب</Label>
              <NativeSelect
                id={`ce-doctor-${caseId}`}
                name="doctorId"
                required
                defaultValue={String(doctorId)}
              >
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`ce-date-${caseId}`}>التاريخ</Label>
              <Input
                id={`ce-date-${caseId}`}
                name="date"
                type="date"
                required
                className="h-11"
                defaultValue={openedDate}
                min={EARLIEST_RECORD_DATE}
                max={today}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`ce-price-${caseId}`}>السعر</Label>
              <Input
                id={`ce-price-${caseId}`}
                name="price"
                inputMode="numeric"
                className="h-11 text-base tabular-nums"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`ce-discount-${caseId}`}>الخصم</Label>
              <Input
                id={`ce-discount-${caseId}`}
                name="discount"
                inputMode="numeric"
                className="h-11 text-base tabular-nums"
                value={disc}
                onChange={(e) => setDisc(e.target.value)}
              />
            </div>
          </div>

          <MoneySummary
            figures={[
              { label: "الصافي", amount: net },
              { label: "المدفوع", amount: paid },
              { label: "المتبقي", amount: net - paid, emphasis: true },
            ]}
          />

          <div className="space-y-1.5">
            <Label htmlFor={`ce-notes-${caseId}`}>ملاحظات (اختياري)</Label>
            <Textarea
              id={`ce-notes-${caseId}`}
              name="notes"
              maxLength={1000}
              defaultValue={notes ?? ""}
            />
          </div>

          <FormError>{state.error}</FormError>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <DialogClose render={<Button type="button" variant="outline" className="h-11" />}>
              إلغاء
            </DialogClose>
            <SubmitButton className="h-11">حفظ التعديل</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
