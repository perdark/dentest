"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/forms/native-select";
import { SubmitButton } from "@/components/forms/submit-button";
import { PAYMENT_KIND_LABELS } from "@/lib/strings";
import {
  createVisitNewCase,
  addVisitPayment,
  searchCollectableCases,
  type VisitFormState,
} from "@/lib/actions/visits";

type DoctorOpt = { id: number; name: string };
type TreatmentOpt = { id: number; nameAr: string; defaultPrice: number };
type CaseBrief = { id: number; label: string };

export function EntryDialog({
  doctors,
  treatments,
  date,
  openCases,
  totalCollectable,
}: {
  doctors: DoctorOpt[];
  treatments: TreatmentOpt[];
  date: string;
  openCases: CaseBrief[];
  totalCollectable: number;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function handleSuccess() {
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="h-11 gap-1.5" />}>
        <Plus className="size-4" />
        إضافة قيد
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>إضافة قيد جديد</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="new">
          <TabsList className="h-11 w-full">
            <TabsTrigger value="new">جديد</TabsTrigger>
            <TabsTrigger value="payment">دفعة</TabsTrigger>
          </TabsList>

          <TabsContent value="new">
            <NewCaseForm
              key={open ? "new-open" : "new-closed"}
              doctors={doctors}
              treatments={treatments}
              date={date}
              onSuccess={handleSuccess}
            />
          </TabsContent>

          <TabsContent value="payment">
            <PaymentForm
              key={open ? "pay-open" : "pay-closed"}
              openCases={openCases}
              totalCollectable={totalCollectable}
              date={date}
              onSuccess={handleSuccess}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ── Mode A: new case + first payment ─────────────────────────────────────────
function NewCaseForm({
  doctors,
  treatments,
  date,
  onSuccess,
}: {
  doctors: DoctorOpt[];
  treatments: TreatmentOpt[];
  date: string;
  onSuccess: () => void;
}) {
  const [state, formAction] = useActionState<VisitFormState, FormData>(
    createVisitNewCase,
    {},
  );
  const first = treatments[0];
  const [treatmentId, setTreatmentId] = useState(first ? String(first.id) : "");
  const [price, setPrice] = useState(first ? String(first.defaultPrice) : "0");
  const done = useRef(false);

  useEffect(() => {
    if (state.ok && !done.current) {
      done.current = true;
      onSuccess();
    }
  }, [state.ok, onSuccess]);

  function onTreatmentChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    setTreatmentId(id);
    const t = treatments.find((x) => String(x.id) === id);
    if (t) setPrice(String(t.defaultPrice));
  }

  return (
    <form action={formAction} className="space-y-3 pt-3">
      <div className="space-y-2">
        <Label htmlFor="nc-name">اسم المريض</Label>
        <Input
          id="nc-name"
          name="patientName"
          required
          autoComplete="off"
          className="h-11"
          placeholder="الاسم الكامل"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nc-phone">رقم الهاتف (اختياري)</Label>
        <Input
          id="nc-phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          className="h-11"
          placeholder="07XXXXXXXXX"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nc-doctor">الطبيب</Label>
        <NativeSelect
          id="nc-doctor"
          name="doctorId"
          defaultValue={doctors[0] ? String(doctors[0].id) : ""}
        >
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="space-y-2">
        <Label htmlFor="nc-treatment">العلاج</Label>
        <NativeSelect
          id="nc-treatment"
          name="treatmentTypeId"
          value={treatmentId}
          onChange={onTreatmentChange}
        >
          {treatments.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nameAr}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="nc-price">السعر</Label>
          <Input
            id="nc-price"
            name="price"
            inputMode="numeric"
            className="h-11"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nc-discount">الخصم</Label>
          <Input
            id="nc-discount"
            name="discount"
            inputMode="numeric"
            className="h-11"
            defaultValue="0"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="nc-paid">المبلغ المدفوع الآن</Label>
          <Input
            id="nc-paid"
            name="paidNow"
            inputMode="numeric"
            className="h-11"
            defaultValue="0"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nc-date">التاريخ</Label>
          <Input id="nc-date" name="date" type="date" className="h-11" defaultValue={date} />
        </div>
      </div>

      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}

      <SubmitButton className="h-11 w-full text-base">حفظ القيد</SubmitButton>
    </form>
  );
}

// ── Mode B: payment on an existing open case ─────────────────────────────────
function PaymentForm({
  openCases,
  totalCollectable,
  date,
  onSuccess,
}: {
  openCases: CaseBrief[];
  totalCollectable: number;
  date: string;
  onSuccess: () => void;
}) {
  const [state, formAction] = useActionState<VisitFormState, FormData>(
    addVisitPayment,
    {},
  );
  const done = useRef(false);

  // البحث يجري على الخادم — العيادة فيها مئات البطاقات المفتوحة. [D3]
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CaseBrief[]>(openCases);
  const [searching, startSearch] = useTransition();
  const latest = useRef(0);

  useEffect(() => {
    if (state.ok && !done.current) {
      done.current = true;
      onSuccess();
    }
  }, [state.ok, onSuccess]);

  function runSearch(next: string) {
    setQuery(next);
    const ticket = ++latest.current;
    startSearch(async () => {
      const found = await searchCollectableCases(next);
      // تجاهُل نتيجة متأخّرة لطلب قديم حتى لا تستبدل الأحدث.
      if (ticket === latest.current) setResults(found);
    });
  }

  if (openCases.length === 0 && query.trim() === "") {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        لا توجد حالات عليها رصيد لإضافة دفعة إليها. أنشئ حالة جديدة من تبويب «جديد».
      </p>
    );
  }

  const kinds = ["session", "down_payment", "adjustment", "refund"] as const;
  const truncated = query.trim() === "" && totalCollectable > openCases.length;

  return (
    <form action={formAction} className="space-y-3 pt-3">
      <div className="space-y-2">
        <Label htmlFor="pv-search">ابحث عن الحالة</Label>
        <Input
          id="pv-search"
          type="search"
          inputMode="search"
          autoComplete="off"
          className="h-11"
          placeholder="اسم المريض أو رقم الهاتف"
          value={query}
          onChange={(e) => runSearch(e.target.value)}
        />
        {truncated ? (
          <p className="text-muted-foreground text-xs">
            تُعرض أحدث {openCases.length} حالة من أصل {totalCollectable} — ابحث
            بالاسم للوصول إلى البقية.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="pv-case">الحالة</Label>
        {results.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-3 text-sm">
            {searching ? "جارٍ البحث…" : "لا توجد حالة مطابقة."}
          </p>
        ) : (
          <NativeSelect
            id="pv-case"
            name="caseId"
            key={results[0]?.id ?? "empty"}
            defaultValue={String(results[0].id)}
          >
            {results.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="pv-amount">المبلغ</Label>
        <Input
          id="pv-amount"
          name="amount"
          inputMode="numeric"
          className="h-11"
          placeholder="0"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="pv-kind">النوع</Label>
        <NativeSelect id="pv-kind" name="kind" defaultValue="session">
          {kinds.map((k) => (
            <option key={k} value={k}>
              {PAYMENT_KIND_LABELS[k]}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="space-y-2">
        <Label htmlFor="pv-date">التاريخ</Label>
        <Input id="pv-date" name="date" type="date" className="h-11" defaultValue={date} />
      </div>

      {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}

      <SubmitButton className="h-11 w-full text-base" disabled={results.length === 0}>
        حفظ الدفعة
      </SubmitButton>
    </form>
  );
}
