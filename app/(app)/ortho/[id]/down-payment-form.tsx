"use client";

import { useActionState, useCallback, useRef, useState } from "react";
import {
  addOrthoDownPayment,
  setOrthoDownPayment,
  type OrthoFormState,
} from "@/lib/actions/ortho";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionToast } from "@/components/forms/use-action-toast";
import { FormError } from "@/components/forms/form-error";
import { MoneySummary } from "@/components/forms/money-summary";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { parseAmount } from "@/lib/format";

/**
 * المقدمة: مبلغ يُتفق عليه مرة، ثم يُسدَّد على دفعات.
 *
 * كانت المقدمة تُقبض كاملة يوم فتح الحالة، والواقع أن العيادة تتفق على ٢٠٠ ألف
 * وتقبض ٥٠ اليوم والباقي على زيارات. لذلك حقلان منفصلان: الاتفاق يُعدَّل هنا،
 * والقبض يُسجَّل دفعةً دفعة. [قرار العيادة 2026-08-25]
 */
export function OrthoDownPaymentSection({
  caseId,
  today,
  agreed,
  collected,
  canCollect,
}: {
  caseId: number;
  today: string;
  /** المقدمة المتفق عليها كما هي محفوظة على الحالة. */
  agreed: number;
  /** ما قُبض منها فعلاً. */
  collected: number;
  canCollect: boolean;
}) {
  const remaining = Math.max(0, agreed - collected);

  return (
    <div className="flex flex-col gap-5">
      <AgreedForm caseId={caseId} agreed={agreed} collected={collected} />
      {agreed > 0 ? (
        <InstalmentForm
          caseId={caseId}
          today={today}
          collected={collected}
          remaining={remaining}
          canCollect={canCollect}
        />
      ) : (
        <p className="text-muted-foreground text-sm">
          حدِّد المقدمة المتفق عليها أولاً، ثم سجّل ما يُقبض منها دفعةً دفعة.
        </p>
      )}
    </div>
  );
}

function AgreedForm({
  caseId,
  agreed,
  collected,
}: {
  caseId: number;
  agreed: number;
  collected: number;
}) {
  const [value, setValue] = useState(agreed ? String(agreed) : "");
  const [state, formAction] = useActionState<OrthoFormState, FormData>(
    setOrthoDownPayment,
    {},
  );
  const next = parseAmount(value);

  useActionToast(state, "تم حفظ المقدمة المتفق عليها");

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="caseId" value={caseId} />
      <Field data-invalid={Boolean(state.error)}>
        <FieldLabel htmlFor={`ortho-agreed-${caseId}`}>
          المقدمة المتفق عليها
        </FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id={`ortho-agreed-${caseId}`}
            name="downPaymentAgreed"
            inputMode="numeric"
            className="h-11 min-w-40 flex-1 text-base tabular-nums"
            placeholder="مثال: 200,000"
            aria-invalid={Boolean(state.error)}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <SubmitButton variant="outline" className="h-11">
            حفظ المقدمة
          </SubmitButton>
        </div>
        {/* المقدمة لا تنزل تحت ما قُبض منها — السطر يقول ذلك قبل أن يرفضه الخادم. */}
        <MoneySummary
          figures={[
            { label: "المقبوض من المقدمة", amount: collected },
            {
              label: "المتبقي من المقدمة",
              amount: Math.max(0, next - collected),
              emphasis: true,
            },
          ]}
        />
      </Field>
      <FormError>{state.error}</FormError>
    </form>
  );
}

function InstalmentForm({
  caseId,
  today,
  collected,
  remaining,
  canCollect,
}: {
  caseId: number;
  today: string;
  collected: number;
  remaining: number;
  canCollect: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [amount, setAmount] = useState("");
  const [state, formAction] = useActionState<OrthoFormState, FormData>(
    addOrthoDownPayment,
    {},
  );

  useActionToast(
    state,
    "تم تسجيل دفعة من المقدمة",
    useCallback(() => {
      formRef.current?.reset();
      setAmount("");
    }, []),
  );

  if (remaining === 0) {
    return (
      <p className="bg-muted/40 rounded-lg px-3 py-2.5 text-sm">
        اكتملت المقدمة — لم يبقَ منها شيء. ما يُقبض بعد ذلك يُسجَّل جلسةً.
      </p>
    );
  }

  if (!canCollect) {
    return (
      <p className="text-muted-foreground text-sm">
        الحالة مغلقة — أعد فتحها لتسجيل دفعة من المقدمة.
      </p>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-4 border-t pt-4"
    >
      <input type="hidden" name="caseId" value={caseId} />

      <FieldGroup>
        <Field data-invalid={Boolean(state.error)}>
          <FieldLabel htmlFor={`ortho-down-amount-${caseId}`}>
            المبلغ المقبوض من المقدمة
          </FieldLabel>
          <Input
            id={`ortho-down-amount-${caseId}`}
            name="amount"
            inputMode="numeric"
            required
            className="h-11 text-base tabular-nums"
            placeholder="مثال: 50,000"
            aria-invalid={Boolean(state.error)}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <MoneySummary
            figures={[
              { label: "المقبوض من المقدمة", amount: collected },
              {
                label: "المتبقي بعد هذه الدفعة",
                amount: remaining - parseAmount(amount),
                emphasis: true,
              },
            ]}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={`ortho-down-date-${caseId}`}>التاريخ</FieldLabel>
          <Input
            id={`ortho-down-date-${caseId}`}
            name="paidDate"
            type="date"
            defaultValue={today}
            className="h-11"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={`ortho-down-note-${caseId}`}>
            ملاحظة (اختياري)
          </FieldLabel>
          <Input
            id={`ortho-down-note-${caseId}`}
            name="note"
            autoComplete="off"
            className="h-11"
          />
        </Field>

        <FormError>{state.error}</FormError>
      </FieldGroup>

      <SubmitButton className="h-11 w-full">تسجيل دفعة المقدمة</SubmitButton>
    </form>
  );
}
