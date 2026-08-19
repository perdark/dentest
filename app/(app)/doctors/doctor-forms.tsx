"use client";

import { useActionState, useCallback, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { MoneySummary } from "@/components/forms/money-summary";
import { parseAmount } from "@/lib/format";
import { LAB_BRANCH_LABELS } from "@/lib/strings";
import {
  addDoctor,
  saveDoctor,
  addLabEntryAction,
  removeLabEntry,
  type DoctorState,
} from "@/lib/actions/doctors";

// ── إضافة طبيب ───────────────────────────────────────────────────────────────
export function AddDoctorDialog() {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<DoctorState, FormData>(addDoctor, {});

  useActionToast(
    state,
    "تمت إضافة الطبيب",
    useCallback(() => {
      setOpen(false);
      formRef.current?.reset();
    }, []),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="h-11 gap-1.5">
            <Plus className="size-4" />
            إضافة طبيب
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>إضافة طبيب</DialogTitle>
          <DialogDescription>
            الاسم يكفي للبدء — النسبة واسم المختبر يمكن ضبطهما لاحقاً.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} action={formAction} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="dr-name">اسم الطبيب</Label>
            <Input id="dr-name" name="name" required autoComplete="off" className="h-11" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dr-pct">النسبة (%)</Label>
            <Input
              id="dr-pct"
              name="commissionPct"
              inputMode="numeric"
              className="h-11"
              placeholder="تُترك فارغة لاستعمال النسبة الافتراضية"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dr-lab">اسم المختبر</Label>
            <Input id="dr-lab" name="labName" autoComplete="off" className="h-11" />
          </div>

          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="doesOrtho" className="size-4" />
            يعمل تقويم أسنان
          </label>

          {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <DialogClose
              render={
                <Button type="button" variant="outline" className="h-11">
                  إلغاء
                </Button>
              }
            />
            <SubmitButton className="h-11">حفظ</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── بيانات الطبيب ────────────────────────────────────────────────────────────
export function DoctorInfoForm({
  id,
  name,
  commissionPct,
  labName,
  doesOrtho,
  isActive,
}: {
  id: number;
  name: string;
  commissionPct: number | null;
  labName: string | null;
  doesOrtho: boolean;
  isActive: boolean;
}) {
  const [state, formAction] = useActionState<DoctorState, FormData>(saveDoctor, {});
  useActionToast(state, "تم حفظ بيانات الطبيب");

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />

      <div className="space-y-1.5">
        <Label htmlFor="di-name">الاسم</Label>
        <Input
          id="di-name"
          name="name"
          required
          defaultValue={name}
          autoComplete="off"
          className="h-11"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="di-pct">النسبة (%)</Label>
          <Input
            id="di-pct"
            name="commissionPct"
            inputMode="numeric"
            defaultValue={commissionPct ?? ""}
            className="h-11"
            placeholder="النسبة الافتراضية"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="di-lab">اسم المختبر</Label>
          <Input
            id="di-lab"
            name="labName"
            defaultValue={labName ?? ""}
            autoComplete="off"
            className="h-11"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="doesOrtho"
            defaultChecked={doesOrtho}
            className="size-4"
          />
          يعمل تقويم أسنان
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={isActive}
            className="size-4"
          />
          نشط
        </label>
      </div>

      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}

      <SubmitButton className="h-11">حفظ البيانات</SubmitButton>
    </form>
  );
}

// ── قيد مختبر جديد ───────────────────────────────────────────────────────────
export function LabEntryForm({ doctorId, today }: { doctorId: number; today: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [amount, setAmount] = useState("");
  const [state, formAction] = useActionState<DoctorState, FormData>(
    addLabEntryAction,
    {},
  );

  useActionToast(
    state,
    "تم حفظ قيد المختبر",
    useCallback(() => {
      formRef.current?.reset();
      setAmount("");
    }, []),
  );

  const parsed = parseAmount(amount);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="bg-muted/30 flex flex-col gap-3 rounded-lg p-3"
    >
      <input type="hidden" name="doctorId" value={doctorId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="le-amount">المبلغ</Label>
          <Input
            id="le-amount"
            name="amount"
            inputMode="numeric"
            className="h-11"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="le-branch">الفرع</Label>
          <NativeSelect id="le-branch" name="branch" defaultValue="fixed">
            {Object.entries(LAB_BRANCH_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="le-date">التاريخ</Label>
          <Input
            id="le-date"
            name="entryDate"
            type="date"
            defaultValue={today}
            className="h-11"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="le-patient">المريض (اختياري)</Label>
          <Input id="le-patient" name="patientName" autoComplete="off" className="h-11" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="le-note">ملاحظة</Label>
        <Input id="le-note" name="note" autoComplete="off" className="h-11" />
      </div>

      {parsed !== 0 ? (
        <MoneySummary
          figures={[{ label: parsed < 0 ? "دفعة للمختبر" : "مستحق للمختبر", amount: parsed, emphasis: true }]}
        />
      ) : null}

      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}

      <SubmitButton className="h-11 sm:self-start">إضافة القيد</SubmitButton>
    </form>
  );
}

// ── حذف قيد ──────────────────────────────────────────────────────────────────
export function DeleteLabEntry({ id, doctorId }: { id: number; doctorId: number }) {
  const [state, formAction, pending] = useActionState<DoctorState, FormData>(
    removeLabEntry,
    {},
  );
  useActionToast(state, "تم حذف القيد");

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="doctorId" value={doctorId} />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-destructive size-11"
        aria-label="حذف قيد المختبر"
        disabled={pending}
      >
        <Trash2 className="size-4" />
      </Button>
    </form>
  );
}
