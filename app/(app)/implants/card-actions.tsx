"use client";

import { useActionState, useCallback, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { FormError } from "@/components/forms/form-error";
import { formatIQD, parseAmount } from "@/lib/format";
import { MoneySummary } from "@/components/forms/money-summary";
import { CASE_STATUS_LABELS } from "@/lib/strings";
import { updateImplantCard, type ImplantFormState } from "@/lib/actions/implants";
import { PayDialog } from "../debts/pay-dialog";

type CardData = {
  caseId: number;
  /**
   * عنوان المريض من ملفّه (وعنوان البطاقة القديم فقط إن لم يكن للملف عنوان).
   * التعديل من هنا يكتب في ملف المريض — عنوان واحد لا عنوانان. [2026-09-27]
   */
  address: string | null;
  labCost: number;
  listPrice: number;
  discount: number;
  status: "open" | "completed" | "cancelled";
  notes: string | null;
  /** المدفوع حتى الآن — يُقرأ للسطر الحيّ فقط، والحساب المعتمد على الخادم. */
  paid: number;
  /** المتبقي — للسطر الحيّ في حوار الدفعة فقط. */
  remaining: number;
  patientName: string;
};

/**
 * «إضافة دفعة» هنا هو الحوار نفسه الذي في «الديون» وملف المريض. كانت للبطاقة
 * نافذة «إضافة جلسة» خاصة بها: فيها ملاحظة وليس فيها استرجاع، والحواران
 * الآخران بالعكس — ثلاثة طرق لإضافة المال نفسه بثلاثة أشكال. [2026-09-27]
 *
 * `showLabCost`: «كلفة المختبر» لا تدخل أي رقم إلا حين يكون «خصم المختبر من
 * حصة الطبيب» مفعّلاً في الإعدادات، فتُخفى وإلا — والقيمة المحفوظة لا تُمسّ.
 */
export function CardActions({
  card,
  today,
  showLabCost,
}: {
  card: CardData;
  today: string;
  showLabCost: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <EditDialog card={card} showLabCost={showLabCost} />
      <PayDialog
        caseId={card.caseId}
        patientName={card.patientName}
        remaining={card.remaining}
        today={today}
      />
    </div>
  );
}

function EditDialog({ card, showLabCost }: { card: CardData; showLabCost: boolean }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<ImplantFormState, FormData>(
    updateImplantCard,
    {},
  );
  // معاينة فقط — الإجمالي النهائي يُحتسب على الخادم. [A3]
  const [price, setPrice] = useState(String(card.listPrice));
  const [discount, setDiscount] = useState(String(card.discount));
  const previewTotal = Math.max(0, parseAmount(price) - parseAmount(discount));

  useActionToast(
    state,
    "تم حفظ تعديلات البطاقة",
    useCallback(() => setOpen(false), []),
  );

  // بقية الحقول تعود إلى قيم البطاقة وحدها عند الإغلاق لأنها غير متحكَّم بها،
  // أما السعر والخصم فكانا يحتفظان بتعديل مهجور: تُغلق النافذة بـ«إلغاء» ثم
  // تُفتح فتُقرأ الأرقام المتروكة كأنها المحفوظة في البطاقة.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setPrice(String(card.listPrice));
      setDiscount(String(card.discount));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" className="h-11">
            <Pencil className="size-4" />
            تعديل البطاقة
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>تعديل بيانات البطاقة</DialogTitle>
          <DialogDescription>
            تُحفظ التعديلات بعد التحقق منها على الخادم.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} action={formAction} className="space-y-3">
          <input type="hidden" name="caseId" value={card.caseId} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ed-address">العنوان</Label>
              {/* يُحفظ في ملف المريض، فيظهر هناك وعلى كل بطاقاته. */}
              <Input
                id="ed-address"
                name="address"
                defaultValue={card.address ?? ""}
                className="h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ed-price">السعر الكلي (د.ع)</Label>
              <Input
                id="ed-price"
                name="price"
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="h-11 text-base tabular-nums"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ed-discount">الخصم (د.ع)</Label>
              <Input
                id="ed-discount"
                name="discount"
                inputMode="numeric"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="h-11 text-base tabular-nums"
              />
            </div>

            <div className="bg-muted/50 flex items-center justify-between rounded-lg px-3 py-2 sm:col-span-2">
              <span className="text-muted-foreground text-sm">
                الإجمالي بعد الخصم
              </span>
              <span className="money text-base font-bold tabular-nums">
                {formatIQD(previewTotal)}
              </span>
            </div>

            {/* خلية شبكة كاملة العرض — نصف سطر لا يكفي رقمين ولافتتيهما. */}
            <div className="sm:col-span-2">
              <MoneySummary
                figures={[
                  { label: "المدفوع", amount: card.paid },
                  {
                    label: "المتبقي بعد التعديل",
                    amount: previewTotal - card.paid,
                    emphasis: true,
                  },
                ]}
              />
            </div>

            {/* الحقل الغائب لا يُرسَل، والخادم لا يلمس الكلفة المحفوظة حين
                لا يجدها — إخفاؤه لا يصفّرها. */}
            {showLabCost ? (
              <div className="space-y-1.5">
                <Label htmlFor="ed-labCost">كلفة المختبر (د.ع)</Label>
                <Input
                  id="ed-labCost"
                  name="labCost"
                  inputMode="numeric"
                  defaultValue={String(card.labCost)}
                  className="h-11 text-base tabular-nums"
                />
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="ed-status">الحالة</Label>
              <NativeSelect id="ed-status" name="status" defaultValue={card.status}>
                <option value="open">{CASE_STATUS_LABELS.open}</option>
                <option value="completed">{CASE_STATUS_LABELS.completed}</option>
                <option value="cancelled">{CASE_STATUS_LABELS.cancelled}</option>
              </NativeSelect>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ed-notes">ملاحظات</Label>
              <Textarea id="ed-notes" name="notes" defaultValue={card.notes ?? ""} />
            </div>
          </div>

          <FormError>{state.error}</FormError>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => handleOpenChange(false)}
            >
              إلغاء
            </Button>
            <SubmitButton className="h-11">حفظ التعديلات</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
