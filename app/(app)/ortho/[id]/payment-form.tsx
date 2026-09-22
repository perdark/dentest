"use client";

import { useActionState, useCallback, useRef, useState } from "react";
import { addOrthoPayment, type OrthoFormState } from "@/lib/actions/ortho";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionToast } from "@/components/forms/use-action-toast";
import { FormError } from "@/components/forms/form-error";
import { MoneySummary } from "@/components/forms/money-summary";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { parseAmount } from "@/lib/format";
import { EARLIEST_RECORD_DATE } from "@/lib/dates";

export function OrthoPaymentForm({
  caseId,
  today,
  paidSoFar,
  canCollect,
}: {
  caseId: number;
  today: string;
  /** مجموع ما دفعته الحالة حتى الآن — للسطر الحيّ أسفل النموذج. */
  paidSoFar: number;
  canCollect: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [amount, setAmount] = useState("");
  const [state, formAction] = useActionState<OrthoFormState, FormData>(
    addOrthoPayment,
    {},
  );

  useActionToast(
    state,
    "تمت إضافة الجلسة بنجاح",
    useCallback(() => {
      formRef.current?.reset();
      setAmount("");
    }, []),
  );

  if (!canCollect) {
    return (
      <p className="text-muted-foreground py-4 text-center text-sm">
        الحالة مغلقة — أعد فتحها من الأعلى لإضافة جلسة جديدة.
      </p>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="caseId" value={caseId} />

      <FieldGroup>
        <Field data-invalid={Boolean(state.error)}>
          <FieldLabel htmlFor={`ortho-amount-${caseId}`}>مبلغ الجلسة</FieldLabel>
          <Input
            id={`ortho-amount-${caseId}`}
            name="amount"
            inputMode="numeric"
            required
            className="h-11 text-base tabular-nums"
            placeholder="مثال: 100,000"
            aria-invalid={Boolean(state.error)}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <MoneySummary
            figures={[
              { label: "المدفوع حتى الآن", amount: paidSoFar },
              {
                label: "بعد هذه الدفعة",
                amount: paidSoFar + parseAmount(amount),
                emphasis: true,
              },
            ]}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={`ortho-paid-date-${caseId}`}>التاريخ</FieldLabel>
          <Input
            id={`ortho-paid-date-${caseId}`}
            name="paidDate"
            type="date"
            defaultValue={today}
            min={EARLIEST_RECORD_DATE}
            max={today}
            className="h-11"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={`ortho-note-${caseId}`}>ملاحظة (اختياري)</FieldLabel>
          <Input
            id={`ortho-note-${caseId}`}
            name="note"
            autoComplete="off"
            className="h-11"
          />
        </Field>

        <FormError>{state.error}</FormError>
      </FieldGroup>

      <SubmitButton className="h-11 w-full">حفظ الجلسة</SubmitButton>
    </form>
  );
}
