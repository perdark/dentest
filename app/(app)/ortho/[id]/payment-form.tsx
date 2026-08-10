"use client";

import { useActionState, useEffect, useRef } from "react";
import { addOrthoPayment, type OrthoFormState } from "@/lib/actions/ortho";
import { SubmitButton } from "@/components/forms/submit-button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function OrthoPaymentForm({
  caseId,
  today,
  canCollect,
}: {
  caseId: number;
  today: string;
  canCollect: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<OrthoFormState, FormData>(
    addOrthoPayment,
    {},
  );

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  if (!canCollect) {
    return (
      <p className="text-muted-foreground py-4 text-center text-sm">
        لا توجد دفعة جلسة قابلة للتسجيل لهذه الحالة.
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
        {state.ok ? <p className="text-sm text-emerald-700">تم تسجيل الدفعة.</p> : null}
      </FieldGroup>

      <SubmitButton className="h-11 w-full">تسجيل الدفعة</SubmitButton>
    </form>
  );
}
