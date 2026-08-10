"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Pencil, Plus } from "lucide-react";
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
import { formatIQD, parseAmount } from "@/lib/format";
import { CASE_STATUS_LABELS } from "@/lib/strings";
import {
  updateImplantCard,
  addImplantSession,
  type ImplantFormState,
} from "@/lib/actions/implants";

type CardData = {
  caseId: number;
  device: string | null;
  address: string | null;
  labCost: number;
  listPrice: number;
  discount: number;
  status: "open" | "completed" | "cancelled";
  notes: string | null;
};

export function CardActions({
  card,
  today,
}: {
  card: CardData;
  today: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <EditDialog card={card} />
      <SessionDialog caseId={card.caseId} today={today} />
    </div>
  );
}

function EditDialog({ card }: { card: CardData }) {
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
              <Label htmlFor="ed-device">الجهاز</Label>
              <Input
                id="ed-device"
                name="device"
                defaultValue={card.device ?? ""}
                className="h-11"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ed-address">العنوان</Label>
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
                className="h-11"
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
                className="h-11"
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

            <div className="space-y-1.5">
              <Label htmlFor="ed-labCost">كلفة المختبر (د.ع)</Label>
              <Input
                id="ed-labCost"
                name="labCost"
                inputMode="numeric"
                defaultValue={String(card.labCost)}
                className="h-11"
              />
            </div>

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
            <SubmitButton className="h-11">حفظ التعديلات</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SessionDialog({ caseId, today }: { caseId: number; today: string }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<ImplantFormState, FormData>(
    addImplantSession,
    {},
  );

  useEffect(() => {
    if (state.ok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- useActionState resolves after the submit event.
      setOpen(false);
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="h-11">
            <Plus className="size-4" />
            إضافة جلسة
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إضافة جلسة (دفعة)</DialogTitle>
          <DialogDescription>
            تُحتسب الجلسة للطبيب صاحب البطاقة.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} action={formAction} className="space-y-3">
          <input type="hidden" name="caseId" value={caseId} />

          <div className="space-y-1.5">
            <Label htmlFor="ss-amount">المبلغ (د.ع)</Label>
            <Input
              id="ss-amount"
              name="amount"
              inputMode="numeric"
              placeholder="0"
              required
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ss-date">التاريخ</Label>
            <Input
              id="ss-date"
              name="date"
              type="date"
              defaultValue={today}
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ss-note">ملاحظة</Label>
            <Input id="ss-note" name="note" className="h-11" />
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
            <SubmitButton className="h-11">حفظ الجلسة</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
