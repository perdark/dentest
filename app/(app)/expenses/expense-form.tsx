"use client";

import { useActionState, useCallback, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/forms/native-select";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionToast } from "@/components/forms/use-action-toast";
import { FormError } from "@/components/forms/form-error";
import { MoneySummary } from "@/components/forms/money-summary";
import { parseAmount } from "@/lib/format";
import { EXPENSE_CATEGORIES } from "@/lib/strings";
import { addExpenseAction, type ExpenseFormState } from "@/lib/actions/expenses";
import { EARLIEST_RECORD_DATE } from "@/lib/dates";

export function ExpenseForm({
  today,
  cashOnHand,
}: {
  today: string;
  /** رصيد الصندوق قبل هذا المصروف — للسطر الحيّ أسفل النموذج. */
  cashOnHand: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [amount, setAmount] = useState("");
  const [state, formAction] = useActionState<ExpenseFormState, FormData>(
    addExpenseAction,
    {},
  );

  useActionToast(
    state,
    "تم حفظ المصروف بنجاح",
    useCallback(() => {
      formRef.current?.reset();
      setAmount("");
    }, []),
  );

  // معاينة فقط — الرصيد المعتمد يُشتق دائماً على الخادم. المصروف يُنقص نقد
  // العيادة، فالرقم الذي يعني شيئاً قبل الحفظ هو ما يبقى في الصندوق بعده.
  const parsed = parseAmount(amount);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="size-4" />
          إضافة مصروف
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="exp-date">التاريخ</Label>
              <Input
                id="exp-date"
                name="date"
                type="date"
                defaultValue={today}
                min={EARLIEST_RECORD_DATE}
                max={today}
                className="h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exp-category">الفئة</Label>
              <NativeSelect
                id="exp-category"
                name="category"
                defaultValue={EXPENSE_CATEGORIES[0].key}
                required
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exp-amount">المبلغ (د.ع)</Label>
              <Input
                id="exp-amount"
                name="amount"
                inputMode="numeric"
                placeholder="0"
                required
                className="h-11 text-base tabular-nums"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exp-note">ملاحظة (اختياري)</Label>
              <Input id="exp-note" name="note" autoComplete="off" className="h-11" />
            </div>
          </div>

          {parsed !== 0 ? (
            <MoneySummary
              figures={[
                { label: "رصيد الصندوق", amount: cashOnHand },
                {
                  label: "الرصيد بعد المصروف",
                  amount: cashOnHand - parsed,
                  emphasis: true,
                },
              ]}
            />
          ) : null}

          <FormError>{state.error}</FormError>

          <div className="flex justify-end pt-1">
            <SubmitButton className="h-11 w-full sm:w-auto">
              حفظ المصروف
            </SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
