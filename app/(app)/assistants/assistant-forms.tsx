"use client";

import { useActionState, useCallback, useState } from "react";
import { Pause, Pencil, Play, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { ConfirmDeleteDialog } from "@/components/forms/confirm-delete-dialog";
import { parseAmount } from "@/lib/format";
import { EARLIEST_RECORD_DATE } from "@/lib/dates";
import { assistantPay } from "@/lib/settlement-math";
import {
  addAssistant,
  deleteAssistantAction,
  editAssistant,
  setAssistantEndAction,
  type AssistantState,
} from "@/lib/actions/assistants";

export type DoctorOption = {
  id: number;
  name: string;
  isOwner: boolean;
  /** His share this month so far, before any assistant. */
  share: number;
  /** What his assistants take from it this month, as computed now. */
  assistantsTotal: number;
};

export type AssistantRow = {
  id: number;
  name: string;
  doctorId: number;
  payMode: "salary" | "percent";
  salary: number;
  pct: number;
  startDate: string;
  notes: string | null;
  /** His pay this month as the settlement computes it now. */
  thisMonth: number;
};

/**
 * «إضافة مساعد» and «تعديل» — one form. The live line answers the question the
 * owner asks before saving: how much does this take out of the doctor's share
 * this month, and what is left for the doctor. Display only; the settlement
 * recomputes it on the server. [rule 6]
 */
export function AssistantDialog({
  doctors,
  today,
  assistant,
}: {
  doctors: DoctorOption[];
  today: string;
  /** Absent = add a new assistant. */
  assistant?: AssistantRow;
}) {
  const editing = Boolean(assistant);
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [doctorId, setDoctorId] = useState(
    String(assistant?.doctorId ?? doctors.find((d) => !d.isOwner)?.id ?? doctors[0]?.id ?? ""),
  );
  const [payMode, setPayMode] = useState<"salary" | "percent">(assistant?.payMode ?? "salary");
  const [salary, setSalary] = useState(assistant?.salary ? String(assistant.salary) : "");
  const [pct, setPct] = useState(assistant?.pct ? String(assistant.pct) : "");
  const [state, formAction] = useActionState<AssistantState, FormData>(
    editing ? editAssistant : addAssistant,
    {},
  );

  useActionToast(
    state,
    editing ? "تم حفظ التعديل" : "تمت إضافة المساعد",
    useCallback(() => setOpen(false), []),
  );

  function reset() {
    setFormKey((k) => k + 1);
    setDoctorId(
      String(assistant?.doctorId ?? doctors.find((d) => !d.isOwner)?.id ?? doctors[0]?.id ?? ""),
    );
    setPayMode(assistant?.payMode ?? "salary");
    setSalary(assistant?.salary ? String(assistant.salary) : "");
    setPct(assistant?.pct ? String(assistant.pct) : "");
  }

  const doctor = doctors.find((d) => String(d.id) === doctorId);
  const share = doctor?.share ?? 0;
  // The other assistants already charged to this doctor this month.
  const others =
    (doctor?.assistantsTotal ?? 0) -
    (assistant && String(assistant.doctorId) === doctorId ? assistant.thisMonth : 0);
  const pctNumber = Number(pct.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660)));
  const pay = assistantPay(share, {
    payMode,
    salary: parseAmount(salary),
    pct: Number.isFinite(pctNumber) ? pctNumber : 0,
  });
  const leftForDoctor = share - others - pay;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger
        render={
          editing ? (
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground size-11"
              aria-label={`تعديل ${assistant!.name}`}
            />
          ) : (
            <Button className="h-11 gap-1.5" />
          )
        }
      >
        {editing ? (
          <Pencil className="size-4" />
        ) : (
          <>
            <Plus className="size-4" />
            إضافة مساعد
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `تعديل — ${assistant!.name}` : "إضافة مساعد"}</DialogTitle>
          <DialogDescription>
            أجر المساعد يُخصم من حصة طبيبه الشهرية — راتباً ثابتاً أو نسبةً من الحصة.
          </DialogDescription>
        </DialogHeader>

        <form key={formKey} action={formAction} className="space-y-3">
          {assistant ? <input type="hidden" name="id" value={assistant.id} /> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="as-name">اسم المساعد</Label>
              <Input
                id="as-name"
                name="name"
                required
                maxLength={120}
                autoComplete="off"
                className="h-11"
                defaultValue={assistant?.name ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="as-doctor">مساعد لـ</Label>
              <NativeSelect
                id="as-doctor"
                name="doctorId"
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
              >
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-sm font-medium">طريقة الأجر</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["salary", "راتب شهري"],
                  ["percent", "نسبة من حصة الطبيب"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="has-checked:border-primary has-checked:bg-primary/5 flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm"
                >
                  <input
                    type="radio"
                    name="payMode"
                    value={value}
                    checked={payMode === value}
                    onChange={() => setPayMode(value)}
                    className="accent-primary size-4"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            {payMode === "salary" ? (
              <div className="space-y-1.5">
                <Label htmlFor="as-salary">الراتب الشهري (د.ع)</Label>
                <Input
                  id="as-salary"
                  name="salary"
                  inputMode="numeric"
                  dir="ltr"
                  autoComplete="off"
                  required
                  className="money h-11 text-start"
                  value={salary}
                  onChange={(e) => setSalary(e.target.value)}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="as-pct">النسبة من حصة الطبيب %</Label>
                <Input
                  id="as-pct"
                  name="pct"
                  inputMode="numeric"
                  dir="ltr"
                  autoComplete="off"
                  required
                  maxLength={3}
                  className="h-11 text-start tabular-nums"
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="as-start">بدأ العمل في</Label>
              <Input
                id="as-start"
                name="startDate"
                type="date"
                required
                min={EARLIEST_RECORD_DATE}
                max={today}
                className="h-11"
                defaultValue={assistant?.startDate ?? today}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="as-notes">ملاحظة (اختياري)</Label>
            <Textarea
              id="as-notes"
              name="notes"
              maxLength={500}
              rows={2}
              defaultValue={assistant?.notes ?? ""}
            />
          </div>

          <div className="bg-muted/40 space-y-1 rounded-lg px-3 py-2.5">
            <MoneySummary
              figures={[
                { label: "حصة الطبيب هذا الشهر حتى الآن", amount: share },
                ...(others > 0 ? [{ label: "مساعدون آخرون", amount: others }] : []),
                { label: "أجر هذا المساعد", amount: pay },
                { label: "يبقى للطبيب", amount: Math.max(0, leftForDoctor), emphasis: true },
              ]}
            />
            {leftForDoctor < 0 ? (
              <p className="text-sm text-amber-700 dark:text-amber-500">
                {doctor?.isOwner
                  ? "حصة المالك لا تغطي الأجر — يُدفع الفرق من صافي العيادة."
                  : "الأجر أكبر من حصة الطبيب هذا الشهر حتى الآن — الفرق يظهر في «الحصيلة» ويُسوّى يدوياً إن بقي حتى آخر الشهر."}
              </p>
            ) : null}
          </div>

          <FormError>{state.error}</FormError>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <DialogClose render={<Button type="button" variant="outline" className="h-11" />}>
              إلغاء
            </DialogClose>
            <SubmitButton className="h-11">{editing ? "حفظ التعديل" : "إضافة"}</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * «إيقاف» / «إعادة للعمل». A stopped assistant is paid through the month of his
 * stop date and not after; his closed months stay readable.
 */
export function AssistantEndButton({
  id,
  name,
  working,
  startDate,
  today,
}: {
  id: number;
  name: string;
  working: boolean;
  startDate: string;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<AssistantState, FormData>(
    setAssistantEndAction,
    {},
  );
  useActionToast(
    state,
    working ? `تم إيقاف ${name}` : `عاد ${name} للعمل`,
    useCallback(() => setOpen(false), []),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground size-11"
            aria-label={working ? `إيقاف ${name}` : `إعادة ${name} للعمل`}
          />
        }
      >
        {working ? <Pause className="size-4" /> : <Play className="size-4" />}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{working ? `إيقاف ${name}` : `إعادة ${name} للعمل`}</DialogTitle>
          <DialogDescription>
            {working
              ? "يُحسب أجره حتى نهاية شهر هذا التاريخ، ثم يتوقف. أشهره المُقفلة تبقى كما هي، ويمكن إعادته لاحقاً."
              : "يعود أجره يُخصم من حصة طبيبه بدءاً من هذا الشهر."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="id" value={id} />
          {working ? (
            <div className="space-y-1.5">
              <Label htmlFor={`as-end-${id}`}>آخر يوم عمل</Label>
              <Input
                id={`as-end-${id}`}
                name="endDate"
                type="date"
                required
                min={startDate}
                className="h-11"
                defaultValue={today < startDate ? startDate : today}
              />
            </div>
          ) : (
            <input type="hidden" name="endDate" value="" />
          )}
          <FormError>{state.error}</FormError>
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <DialogClose render={<Button type="button" variant="outline" className="h-11" />}>
              إلغاء
            </DialogClose>
            <SubmitButton className="h-11">{working ? "إيقاف" : "إعادة للعمل"}</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteAssistantButton({ id, name }: { id: number; name: string }) {
  return (
    <ConfirmDeleteDialog
      action={deleteAssistantAction}
      fields={{ id }}
      title={`حذف ${name}`}
      description="للمساعد المُضاف بالخطأ فقط. من أُقفل له شهر لا يُحذف — يُوقَف بدلاً من ذلك حتى يبقى سجلّه."
      successMessage="تم حذف المساعد"
      ariaLabel={`حذف ${name}`}
    />
  );
}
