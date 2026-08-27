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
import { FormError } from "@/components/forms/form-error";
import { MoneySummary } from "@/components/forms/money-summary";
import { formatIQD, parseAmount } from "@/lib/format";
import { formatDateAr } from "@/lib/dates";
import { LAB_BRANCH_LABELS } from "@/lib/strings";
import {
  addDoctor,
  saveDoctor,
  removeDoctor,
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
            <Label htmlFor="dr-lab">اسم المختبر (اختياري)</Label>
            <Input id="dr-lab" name="labName" autoComplete="off" className="h-11" />
          </div>

          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="doesOrtho" className="size-4" />
            يعمل تقويم أسنان
          </label>

          <FormError>{state.error}</FormError>

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

      <FormError>{state.error}</FormError>

      <SubmitButton className="h-11">حفظ البيانات</SubmitButton>
    </form>
  );
}

// ── تسجيل مختبر جديد ───────────────────────────────────────────────────────────
export function LabEntryForm({ doctorId, today }: { doctorId: number; today: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [amount, setAmount] = useState("");
  const [state, formAction] = useActionState<DoctorState, FormData>(
    addLabEntryAction,
    {},
  );

  useActionToast(
    state,
    "تم حفظ تسجيل المختبر",
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
            className="h-11 text-base tabular-nums"
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
        <Label htmlFor="le-note">ملاحظة (اختياري)</Label>
        <Input id="le-note" name="note" autoComplete="off" className="h-11" />
      </div>

      {parsed !== 0 ? (
        <MoneySummary
          figures={[{ label: parsed < 0 ? "دفعة للمختبر" : "مستحق للمختبر", amount: parsed, emphasis: true }]}
        />
      ) : null}

      <FormError>{state.error}</FormError>

      <SubmitButton className="h-11 sm:self-start">إضافة التسجيل</SubmitButton>
    </form>
  );
}

// ── حذف تسجيل ──────────────────────────────────────────────────────────────────
/**
 * حذف تسجيل مختبر — بتأكيد قبله ورسالة بعده.
 *
 * كان الزر يحذف بضغطة واحدة: سلة مهملات صغيرة في آخر صف من جدول مزدحم، بلا
 * سؤال وبلا تراجع. سطر مال يختفي من مستحقات المختبر ولا يعرف أحد أنه اختفى،
 * ولو فشل الحذف لم يظهر شيء أصلاً لأن `state.error` لم يكن يُطبع في أي مكان.
 * التسجيل يبقى بعد الحذف في «سجل التعديلات»، وهذا ما تقوله النافذة.
 */
export function DeleteLabEntry({
  id,
  doctorId,
  amount,
  entryDate,
}: {
  id: number;
  doctorId: number;
  amount: number;
  entryDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<DoctorState, FormData>(
    removeLabEntry,
    {},
  );

  useActionToast(
    state,
    "تم حذف التسجيل",
    useCallback(() => setOpen(false), []),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive size-11"
            aria-label="حذف تسجيل المختبر"
          >
            <Trash2 className="size-4" />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>حذف تسجيل المختبر</DialogTitle>
          <DialogDescription>
            سيُحذف تسجيل <span className="money">{formatIQD(amount)}</span> بتاريخ{" "}
            {formatDateAr(entryDate)}. مستحقات المختبر متابعة فقط ولا تُخصم من
            حصة الطبيب، ويبقى الحذف مسجّلاً في «سجل التعديلات».
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="doctorId" value={doctorId} />

          <FormError>{state.error}</FormError>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose
              render={
                <Button type="button" variant="outline" className="h-11">
                  تراجع
                </Button>
              }
            />
            <Button
              type="submit"
              variant="destructive"
              className="h-11"
              disabled={pending}
            >
              {pending ? "جارٍ الحذف…" : "تأكيد الحذف"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── حذف طبيب ──────────────────────────────────────────────────────────────────
/**
 * حذف طبيب — متاح للأطباء **بلا أي سجل** فقط.
 *
 * 🔴 ليش مو حذفاً عادياً: `doctors.id` مربوط بخمسة جداول، وأربعة منها
 * `NOT NULL`. حذف طبيب عنده شغل يتّم حالاته ودفعاته وحصائله — يعني رقم مالي
 * بلا صاحب، وشهر محسوب ما عاد ينحسب.
 *
 * فالزر يظهر **دائماً**، والخادم هو اللي يرفض ويشرح السبب بالعدد. إخفاؤه كان
 * راح يخلي المالك يدور على ميزة يظن إنها ناقصة؛ الرفض المشروح يعلّمه القاعدة
 * مرة وحدة: اللي عنده تاريخ **يُوقَف** لا يُحذف.
 *
 * ⚠️ النافذة تذكر «موقوف» صراحةً حتى يعرف البديل بلا ما يسأل.
 */
export function DeleteDoctor({ id, name }: { id: number; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<DoctorState, FormData>(
    removeDoctor,
    {},
  );

  useActionToast(
    state,
    "تم حذف الطبيب",
    useCallback(() => setOpen(false), []),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive size-11"
            aria-label={`حذف الطبيب ${name}`}
          >
            <Trash2 className="size-4" />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>حذف {name}</DialogTitle>
          <DialogDescription>
            الحذف متاح فقط لطبيب ما عنده ولا حالة ولا دفعة ولا موعد — يعني اسم
            انضاف بالغلط. الطبيب اللي عنده شغل مسجّل <b>ما ينحذف</b>: خلّيه
            «موقوف» بدل ذلك، فيختفي من القوائم ويبقى تاريخه سليماً.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={id} />

          <FormError>{state.error}</FormError>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose
              render={
                <Button type="button" variant="outline" className="h-11">
                  تراجع
                </Button>
              }
            />
            <Button
              type="submit"
              variant="destructive"
              className="h-11"
              disabled={pending}
            >
              {pending ? "جارٍ الحذف…" : "تأكيد الحذف"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
