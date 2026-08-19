"use client";

import { useActionState, useCallback, useRef, useState } from "react";
import { addOrthoPayment, type OrthoFormState } from "@/lib/actions/ortho";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionToast } from "@/components/forms/use-action-toast";
import { MoneySummary } from "@/components/forms/money-summary";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { parseAmount } from "@/lib/format";

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
    "تمت إضافة الدفعة بنجاح",
    useCallback(() => {
      formRef.current?.reset();
      setAmount("");
    }, []),
  );

  if (!canCollect) {
    return (
      <p className="text-muted-foreground py-4 text-center text-sm">
        لا يمكن إضافة دفعة جلسة لهذه الحالة.
      </p>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="caseId" value={caseId} />

      <FieldGroup>
        <Field data-invalid={Boolean(state.error)}>
          <FieldLabel htmlFor={`ortho-amount-${caseId}`}>المبلغ</FieldLabel>
          <Input
            id={`ortho-amount-${caseId}`}
            name="amount"
            inputMode="numeric"
            required
            className="h-11"
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

        <FieldError>{state.error}</FieldError>
      </FieldGroup>

      <SubmitButton className="h-11 w-full">إضافة الدفعة</SubmitButton>
    </form>
  );
}
