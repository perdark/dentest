"use client";

import { useActionState, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { HandCoins } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/forms/native-select";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionToast } from "@/components/forms/use-action-toast";
import { FormError } from "@/components/forms/form-error";
import { MoneySummary } from "@/components/forms/money-summary";
import { PatientPicker } from "@/components/forms/patient-picker";
import { formatIQD, isExplicitZero, parseAmount } from "@/lib/format";
import {
  collectableCasesAction,
  recordDebtPayment,
  type CollectableCase,
  type PayState,
} from "@/lib/actions/debts";
import { EARLIEST_RECORD_DATE } from "@/lib/dates";
import type { PatientMatch } from "@/lib/actions/patients";

/**
 * «استلام مبلغ» — money in, with no new treatment. [قرار العيادة 2026-10-22]
 *
 * The clinic asked for a way to take a payment straight from the day's ledger
 * and to choose freely what it goes against. Pick the patient, then one of
 * their cases that can still take money: a treatment with a balance (the same
 * list «الديون» shows for them) or an open ortho case, where it is that day's
 * session. «0» records a free session. The write is `recordDebtPayment`, so
 * this screen and «الديون ← إضافة دفعة» can never disagree about a payment.
 */
export function ReceiptDialog({ date, today }: { date: string; today: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const handleSuccess = useCallback(() => {
    setOpen(false);
    router.refresh();
  }, [router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        data-tour="daily-receipt"
        render={<Button variant="outline" className="h-11 gap-1.5" />}
      >
        <HandCoins className="size-4" />
        استلام مبلغ
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>استلام مبلغ</DialogTitle>
          <DialogDescription>
            دفعة من مريض مسجّل بدون فتح علاج جديد: على علاج عليه مبلغ متبقٍ، أو
            جلسة تقويم.
          </DialogDescription>
        </DialogHeader>
        <ReceiptForm
          key={open ? "r-open" : "r-closed"}
          date={date}
          today={today}
          onSuccess={handleSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}

function ReceiptForm({
  date,
  today,
  onSuccess,
}: {
  date: string;
  today: string;
  onSuccess: () => void;
}) {
  const [state, formAction] = useActionState<PayState, FormData>(recordDebtPayment, {});
  const [patient, setPatient] = useState<PatientMatch | null>(null);
  const [cases, setCases] = useState<CollectableCase[] | null>(null);
  const [caseId, setCaseId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");

  useActionToast(
    state,
    isExplicitZero(amount) ? "تم تسجيل الجلسة المجانية" : "تم استلام المبلغ بنجاح",
    onSuccess,
  );

  const onPick = useCallback(async (p: PatientMatch | null) => {
    setPatient(p);
    setCases(null);
    setCaseId(null);
    if (!p) return;
    const rows = await collectableCasesAction(p.id);
    setCases(rows);
    setCaseId(rows[0]?.id ?? null);
  }, []);

  const chosen = cases?.find((c) => c.id === caseId) ?? null;

  return (
    <form action={formAction} className="space-y-3 pt-3">
      <PatientPicker idPrefix="rc" existingOnly onPick={onPick} />

      {patient && cases === null ? (
        <p className="text-muted-foreground text-sm">جارٍ تحميل حسابات المريض…</p>
      ) : null}

      {patient && cases?.length === 0 ? (
        <p className="text-muted-foreground rounded-lg px-3 py-3 text-sm ring-1 ring-foreground/10">
          لا يوجد على هذا المريض مبلغ متبقٍ ولا حالة تقويم مفتوحة. لعلاج جديد
          استخدم «تسجيل جديد».
        </p>
      ) : null}

      {cases && cases.length > 0 && chosen ? (
        <>
          <input type="hidden" name="caseId" value={chosen.id} />
          <input type="hidden" name="kind" value="session" />

          <div className="space-y-2">
            <Label htmlFor="rc-case">على أي حساب؟</Label>
            <NativeSelect
              id="rc-case"
              value={String(chosen.id)}
              onChange={(e) => setCaseId(Number(e.target.value))}
            >
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.isOrtho
                    ? `${c.treatment} — جلسة — ${c.doctorName}`
                    : `${c.treatment} — المتبقي ${formatIQD(c.remaining)} — ${c.doctorName}`}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rc-amount">المبلغ</Label>
            <Input
              id="rc-amount"
              name="amount"
              inputMode="numeric"
              autoComplete="off"
              required
              className="h-11 text-base tabular-nums"
              placeholder="مثال: 50,000 — أو 0 لجلسة مجانية"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {!chosen.isOrtho && amount.trim() ? (
              <MoneySummary
                figures={[
                  {
                    label: "المتبقي بعد هذه الدفعة",
                    amount: chosen.remaining - parseAmount(amount),
                    emphasis: true,
                  },
                ]}
              />
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="rc-date">التاريخ</Label>
              <Input
                id="rc-date"
                name="date"
                type="date"
                className="h-11"
                defaultValue={date > today ? today : date}
                min={EARLIEST_RECORD_DATE}
                max={today}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rc-note">ملاحظة (اختياري)</Label>
              <Input id="rc-note" name="note" autoComplete="off" className="h-11" />
            </div>
          </div>

          <FormError>{state.error}</FormError>

          <SubmitButton className="h-11 w-full text-base">حفظ</SubmitButton>
        </>
      ) : null}
    </form>
  );
}
