"use client";

import { useActionState, useCallback, useRef } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/forms/native-select";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionToast } from "@/components/forms/use-action-toast";
import { EXPENSE_CATEGORIES } from "@/lib/strings";
import { addExpenseAction, type ExpenseFormState } from "@/lib/actions/expenses";

export function ExpenseForm({ today }: { today: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<ExpenseFormState, FormData>(
    addExpenseAction,
    {},
  );

  useActionToast(
    state,
    "تم حفظ المصروف بنجاح",
    useCallback(() => formRef.current?.reset(), []),
  );

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
                className="h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exp-note">ملاحظة</Label>
              <Input id="exp-note" name="note" className="h-11" />
            </div>
          </div>

          {state.error ? (
            <p className="text-destructive text-sm">{state.error}</p>
          ) : null}

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
