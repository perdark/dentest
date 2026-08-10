"use client";

import { useActionState, useEffect, useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatIQD } from "@/lib/format";
import { recordDebtPayment, type PayState } from "@/lib/actions/debts";

export function PayDialog({
  caseId,
  patientName,
  remaining,
  today,
}: {
  caseId: number;
  patientName: string;
  remaining: number;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<PayState, FormData>(
    recordDebtPayment,
    {},
  );

  // أغلق الحوار بعد نجاح التسجيل.
  useEffect(() => {
    if (state.ok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- useActionState resolves after the submit event.
      setOpen(false);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" className="h-11 whitespace-nowrap" />}
      >
        تسجيل دفعة
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تسجيل دفعة — {patientName}</DialogTitle>
        </DialogHeader>

        <p className="text-muted-foreground text-sm">
          المتبقي:{" "}
          <span className="money text-foreground font-semibold">
            {formatIQD(remaining)}
          </span>
        </p>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="caseId" value={caseId} />

          <div className="space-y-2">
            <Label htmlFor={`amount-${caseId}`}>المبلغ</Label>
            <Input
              id={`amount-${caseId}`}
              name="amount"
              inputMode="numeric"
              autoComplete="off"
              placeholder="مثال: 50,000"
              className="h-11"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`date-${caseId}`}>التاريخ</Label>
            <Input
              id={`date-${caseId}`}
              name="date"
              type="date"
              defaultValue={today}
              className="h-11"
            />
          </div>

          {state.error ? (
            <p className="text-destructive text-sm">{state.error}</p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose
              render={<Button type="button" variant="outline" className="h-11" />}
            >
              إلغاء
            </DialogClose>
            <Button type="submit" className="h-11" disabled={pending}>
              {pending ? "جارٍ الحفظ…" : "حفظ الدفعة"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
