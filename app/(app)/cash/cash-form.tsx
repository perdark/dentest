"use client";

import { useActionState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/forms/native-select";
import { SubmitButton } from "@/components/forms/submit-button";
import { CASH_MOVE_LABELS } from "@/lib/strings";
import { addCashMovement, type CashState } from "@/lib/actions/cash";

// «صرف حصة طبيب» يُسجَّل من شاشة الحصيلة، فلا يظهر هنا.
const MANUAL_TYPES = ["reserve", "withdrawal", "owner_draw", "adjustment"] as const;

export function CashForm({ today }: { today: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<CashState, FormData>(
    addCashMovement,
    {},
  );

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="size-4" />
          تسجيل حركة نقدية
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label htmlFor="cm-date">التاريخ</Label>
              <Input
                id="cm-date"
                name="moveDate"
                type="date"
                defaultValue={today}
                className="h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cm-type">النوع</Label>
              <NativeSelect id="cm-type" name="type" defaultValue="reserve">
                {MANUAL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CASH_MOVE_LABELS[t]}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cm-direction">الاتجاه</Label>
              <NativeSelect id="cm-direction" name="direction" defaultValue="out">
                <option value="out">خارج من الصندوق</option>
                <option value="in">داخل إلى الصندوق</option>
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cm-amount">المبلغ (د.ع)</Label>
              <Input
                id="cm-amount"
                name="amount"
                inputMode="numeric"
                placeholder="0"
                required
                className="h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cm-note">ملاحظة</Label>
              <Input id="cm-note" name="note" className="h-11" autoComplete="off" />
            </div>
          </div>

          {state.error ? (
            <p className="text-destructive text-sm">{state.error}</p>
          ) : null}

          <SubmitButton className="h-11 w-full sm:w-auto">حفظ الحركة</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
