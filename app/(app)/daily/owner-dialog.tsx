"use client";

import { useActionState, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Anchor,
  ArrowRight,
  BookOpen,
  HandCoins,
  Smile,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
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
import { PatientPicker } from "@/components/forms/patient-picker";
import {
  ownerTargetsAction,
  saveOwnerEntry,
  type OwnerEntryState,
  type OwnerTarget,
} from "@/lib/actions/owner-entry";
import { EARLIEST_RECORD_DATE } from "@/lib/dates";
import type { PatientMatch } from "@/lib/actions/patients";

type Kind = "work" | "delivery" | "ortho" | "implant";

/**
 * «د. عدي» — the owner's paper notebook, four buttons. [قرار العيادة 2026-11-15]
 *
 * Every line is a name and an amount, entered in front of the patient. Which
 * case it lands on is worked out by `recordOwnerEntry`; a registered patient
 * with an account of that kind is offered it first, «جديد» otherwise.
 */
const KINDS: { kind: Kind; label: string; hint: string; icon: LucideIcon }[] = [
  { kind: "work", label: "عمل عادي", hint: "حشوة، قلع، تنظيف…", icon: Stethoscope },
  { kind: "delivery", label: "توصيل مبلغ", hint: "دفعة على حساب قديم", icon: HandCoins },
  { kind: "ortho", label: "مقدمة تقويم", hint: "مقدمة لحالة تقويم", icon: Smile },
  { kind: "implant", label: "زراعة", hint: "دفعة على بطاقة زراعة", icon: Anchor },
];

const NEW_ACCOUNT: Record<Exclude<Kind, "work">, string> = {
  delivery: "دين من الدفتر القديم (غير مسجّل بالبرنامج)",
  ortho: "حالة تقويم جديدة",
  implant: "بطاقة زراعة جديدة",
};

const SAVED: Record<Kind, string> = {
  work: "تم حفظ العمل",
  delivery: "تم تسجيل توصيل المبلغ",
  ortho: "تم تسجيل مقدمة التقويم",
  implant: "تم تسجيل دفعة الزراعة",
};

export function OwnerDialog({
  ownerName,
  treatments,
  date,
  today,
}: {
  ownerName: string;
  treatments: { id: number; nameAr: string }[];
  date: string;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind | null>(null);
  const router = useRouter();

  const handleSuccess = useCallback(() => {
    setOpen(false);
    // The next patient starts from the four buttons, not the last one used.
    setKind(null);
    router.refresh();
  }, [router]);

  const current = KINDS.find((k) => k.kind === kind);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setKind(null);
      }}
    >
      <DialogTrigger
        data-tour="daily-owner"
        render={<Button variant="secondary" className="h-11 gap-1.5" />}
      >
        <BookOpen className="size-4" />
        {ownerName}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{current ? `${ownerName} — ${current.label}` : ownerName}</DialogTitle>
          <DialogDescription>
            {current ? "الاسم والمبلغ، ثم حفظ." : "شنو نوع التسجيل؟"}
          </DialogDescription>
        </DialogHeader>

        {current ? (
          <>
            <Button
              type="button"
              variant="ghost"
              className="h-9 w-fit gap-1 px-2"
              onClick={() => setKind(null)}
            >
              <ArrowRight className="size-4" />
              تغيير النوع
            </Button>
            <OwnerForm
              key={current.kind}
              kind={current.kind}
              treatments={treatments}
              date={date}
              today={today}
              onSuccess={handleSuccess}
            />
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3 pt-2">
            {KINDS.map((k) => (
              <button
                key={k.kind}
                type="button"
                data-owner-kind={k.kind}
                onClick={() => setKind(k.kind)}
                className="hover:bg-muted focus-visible:ring-ring flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-xl p-3 text-center ring-1 ring-foreground/15 transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <k.icon className="text-primary size-6" />
                <span className="text-base font-semibold">{k.label}</span>
                <span className="text-muted-foreground text-xs">{k.hint}</span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function OwnerForm({
  kind,
  treatments,
  date,
  today,
  onSuccess,
}: {
  kind: Kind;
  treatments: { id: number; nameAr: string }[];
  date: string;
  today: string;
  onSuccess: () => void;
}) {
  const [state, formAction] = useActionState<OwnerEntryState, FormData>(saveOwnerEntry, {});
  const [targets, setTargets] = useState<OwnerTarget[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPrice, setShowPrice] = useState(false);
  // Held in state: a form action resets uncontrolled fields, so a refused
  // save would otherwise wipe what was typed in front of the patient.
  const [name, setName] = useState("");
  const [treatment, setTreatment] = useState("");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [caseChoice, setCaseChoice] = useState("");
  const [entryDate, setEntryDate] = useState(date > today ? today : date);
  useActionToast(state, SAVED[kind], onSuccess);

  const onPick = useCallback(
    async (p: PatientMatch | null) => {
      setTargets(null);
      if (!p || kind === "work") return;
      setLoading(true);
      try {
        const all = await ownerTargetsAction(p.id);
        setTargets(all[kind]);
        setCaseChoice(all[kind][0] ? String(all[kind][0].id) : "new");
      } finally {
        setLoading(false);
      }
    },
    [kind],
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="kind" value={kind} />

      <PatientPicker idPrefix="ow" onPick={onPick}>
        <div className="space-y-2">
          <Label htmlFor="ow-name">اسم المريض</Label>
          <Input
            id="ow-name"
            name="patientName"
            required
            autoComplete="off"
            className="h-11"
            placeholder="الاسم الكامل"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </PatientPicker>

      {kind !== "work" && loading ? (
        <p className="text-muted-foreground text-sm">جارٍ تحميل حسابات المريض…</p>
      ) : null}

      {kind !== "work" && targets && targets.length > 0 ? (
        <div className="space-y-2">
          <Label htmlFor="ow-case">على أي حساب؟</Label>
          <NativeSelect
            id="ow-case"
            name="caseId"
            value={caseChoice}
            onChange={(e) => setCaseChoice(e.target.value)}
          >
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
            <option value="new">{NEW_ACCOUNT[kind]}</option>
          </NativeSelect>
        </div>
      ) : null}

      {kind === "work" ? (
        <div className="space-y-2">
          <Label htmlFor="ow-treatment">العلاج</Label>
          <Input
            id="ow-treatment"
            name="treatmentName"
            list="ow-treatment-list"
            required
            autoComplete="off"
            className="h-11"
            placeholder="حشوة، قلع، تنظيف…"
            value={treatment}
            onChange={(e) => setTreatment(e.target.value)}
          />
          <datalist id="ow-treatment-list">
            {treatments.map((t) => (
              <option key={t.id} value={t.nameAr} />
            ))}
          </datalist>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="ow-amount">المبلغ</Label>
        <Input
          id="ow-amount"
          name="amount"
          inputMode="numeric"
          autoComplete="off"
          required
          className="h-12 text-lg tabular-nums"
          placeholder="مثال: 50,000"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      {kind === "work" ? (
        showPrice ? (
          <div className="space-y-2">
            <Label htmlFor="ow-price">السعر الكلي (إذا بقى عليه مبلغ)</Label>
            <Input
              id="ow-price"
              name="price"
              inputMode="numeric"
              autoComplete="off"
              className="h-11 text-base tabular-nums"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
        ) : (
          <Button
            type="button"
            variant="link"
            className="h-auto px-0"
            onClick={() => setShowPrice(true)}
          >
            + بقى عليه مبلغ؟
          </Button>
        )
      ) : null}

      {kind === "ortho" || kind === "implant" ? (
        <p className="text-muted-foreground text-sm">
          الحساب الجديد ينفتح بالمبلغ المدفوع — السعر الكلي يتعدّل بعدين من شاشة{" "}
          {kind === "ortho" ? "التقويم" : "الزراعة"}.
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="ow-date">التاريخ</Label>
        <Input
          id="ow-date"
          name="date"
          type="date"
          className="h-11"
          value={entryDate}
          onChange={(e) => setEntryDate(e.target.value)}
          min={EARLIEST_RECORD_DATE}
          max={today}
        />
      </div>

      <FormError>{state.error}</FormError>

      <SubmitButton className="h-12 w-full text-base">حفظ</SubmitButton>
    </form>
  );
}
