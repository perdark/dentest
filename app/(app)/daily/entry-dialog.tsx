"use client";

import { useActionState, useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useActionToast } from "@/components/forms/use-action-toast";
import { FormError } from "@/components/forms/form-error";
import { MoneySummary } from "@/components/forms/money-summary";
import { PAYMENT_KIND_LABELS } from "@/lib/strings";
import { parseAmount } from "@/lib/format";
import {
  createVisitNewCase,
  addVisitPayment,
  searchCollectableCases,
  type CaseOption,
  type VisitFormState,
} from "@/lib/actions/visits";

type DoctorOpt = { id: number; name: string };
type TreatmentOpt = { id: number; nameAr: string };
type CaseBrief = CaseOption;

const PAYMENT_KINDS = ["session", "down_payment", "adjustment", "refund"] as const;
type PaymentKind = (typeof PAYMENT_KINDS)[number];

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
  // بدون هذا يقع تركيز الفتح على شريط التبويبين — أول عنصر قابل للتبويب داخل
  // النافذة — فيبدأ إدخال كل تسجيل بضغطة Tab زائدة، وأسهم لوحة المفاتيح تبدّل
  // التبويب بدل أن تكتب. الاسم هو أول ما يُكتب، فهو أول ما يُركَّز عليه.
  const nameRef = useRef<HTMLInputElement>(null);

  const handleSuccess = useCallback(() => {
    setOpen(false);
    router.refresh();
  }, [router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="h-11 gap-1.5" />}>
        <Plus className="size-4" />
        تسجيل جديد
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" initialFocus={nameRef}>
        <DialogHeader>
          <DialogTitle>تسجيل جديد</DialogTitle>
          {/* التبويبان يتشابهان في العين ويختلفان تماماً في الأثر: أحدهما يفتح
              حساباً جديداً والآخر يُنقص رصيداً قائماً. الفرق مكتوب، لا مُستنتَج. */}
          <DialogDescription>
            اختر «علاج جديد» إذا كانت هذه أول مرة يُفتح فيها حساب هذا العلاج،
            و«دفعة على علاج سابق» إذا كان المريض يسدّد على حالة مفتوحة.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="new">
          <TabsList className="h-11 w-full">
            <TabsTrigger value="new">علاج جديد</TabsTrigger>
            <TabsTrigger value="payment">دفعة على علاج سابق</TabsTrigger>
          </TabsList>

          <TabsContent value="new">
            <NewCaseForm
              key={open ? "new-open" : "new-closed"}
              doctors={doctors}
              treatments={treatments}
              date={date}
              nameRef={nameRef}
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
  nameRef,
  onSuccess,
}: {
  doctors: DoctorOpt[];
  treatments: TreatmentOpt[];
  date: string;
  nameRef?: React.RefObject<HTMLInputElement | null>;
  onSuccess: () => void;
}) {
  const [state, formAction] = useActionState<VisitFormState, FormData>(
    createVisitNewCase,
    {},
  );
  // لا سعر مقترَح: سعر العلاج يُتّفق عليه مع كل مريض على حدة، فيُكتب هنا يدوياً.
  const [price, setPrice] = useState("");
  const [discount, setDiscount] = useState("0");
  const [paidNow, setPaidNow] = useState("0");

  useActionToast(state, "تم حفظ العلاج الجديد ودفعته", onSuccess);

  // الحساب الحيّ — عرض فقط. الخادم يعيد حساب الرقم نفسه عند الحفظ.
  const net = Math.max(0, parseAmount(price) - parseAmount(discount));
  const remaining = net - parseAmount(paidNow);

  return (
    <form action={formAction} className="space-y-3 pt-3">
      <div className="space-y-2">
        <Label htmlFor="nc-name">اسم المريض</Label>
        <Input
          id="nc-name"
          ref={nameRef}
          name="patientName"
          required
          autoComplete="off"
          className="h-11"
          placeholder="الاسم الكامل"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nc-phone">رقم الهاتف (اختياري)</Label>
        {/* الأرقام تُكتب وتُقرأ من اليسار حتى داخل صفحة عربية، ولوحة الهاتف
            تفتح على الأرقام مباشرة. */}
        <Input
          id="nc-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          dir="ltr"
          autoComplete="off"
          className="h-11 text-start"
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

      {/* العلاج يُكتب باليد: أسماء العلاجات تختلف من عيادة إلى أخرى ومن حالة إلى
          أخرى، والأسماء المستعملة سابقاً تُقترح هنا فتُكتب مرة واحدة فقط. */}
      <div className="space-y-2">
        <Label htmlFor="nc-treatment">العلاج</Label>
        <Input
          id="nc-treatment"
          name="treatmentName"
          list="nc-treatment-list"
          required
          autoComplete="off"
          className="h-11"
          placeholder="حشوة، قلع، تنظيف…"
        />
        <datalist id="nc-treatment-list">
          {treatments.map((t) => (
            <option key={t.id} value={t.nameAr} />
          ))}
        </datalist>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="nc-price">السعر</Label>
          {/* حقول المال تُقرأ بحجم النص الكامل: `Input` يهبط إلى 14px على
              الشاشات الكبيرة، وهذا رقم يُدقَّق لا رقم يُتصفَّح. */}
          <Input
            id="nc-price"
            name="price"
            inputMode="numeric"
            className="h-11 text-base tabular-nums"
            placeholder="0"
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
            className="h-11 text-base tabular-nums"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
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
            className="h-11 text-base tabular-nums"
            value={paidNow}
            onChange={(e) => setPaidNow(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nc-date">التاريخ</Label>
          <Input id="nc-date" name="date" type="date" className="h-11" defaultValue={date} />
        </div>
      </div>

      {/* لا يظهر السطر على نموذج فارغ: بلا سعر مكتوب لا معنى لصافٍ ولا لمتبقٍ. */}
      {price.trim() ? (
        <MoneySummary
          figures={[
            { label: "الصافي", amount: net },
            { label: "المتبقي", amount: remaining, emphasis: true },
          ]}
        />
      ) : null}

      <FormError>{state.error}</FormError>

      <SubmitButton className="h-11 w-full text-base">حفظ التسجيل</SubmitButton>
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

  // البحث يجري على الخادم — العيادة فيها مئات البطاقات المفتوحة. [D3]
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CaseBrief[]>(openCases);
  const [searching, startSearch] = useTransition();
  const latest = useRef(0);
  const [chosenId, setChosenId] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<PaymentKind>("session");

  useActionToast(state, "تمت إضافة الدفعة بنجاح", onSuccess);

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
        لا توجد حالات عليها رصيد لإضافة دفعة إليها. افتح حالة من تبويب «علاج
        جديد».
      </p>
    );
  }

  const truncated = query.trim() === "" && totalCollectable > openCases.length;

  // اختيار الحالة يتبع نتائج البحث: ما لم تعد الحالة المختارة ضمن النتائج،
  // يعود الاختيار إلى أولها — وهو نفسه ما يقرأه السطر الحيّ أسفل المبلغ.
  const selectedId = results.some((c) => String(c.id) === chosenId)
    ? chosenId
    : results[0]
      ? String(results[0].id)
      : "";
  const selected = results.find((c) => String(c.id) === selectedId);
  // الاسترجاع يزيد الرصيد المطلوب بدل أن يُنقصه — نفس ما تفعله طبقة الدفعات.
  const afterPayment = selected
    ? selected.remaining + (kind === "refund" ? 1 : -1) * parseAmount(amount)
    : 0;

  return (
    <form action={formAction} className="space-y-3 pt-3">
      <div className="space-y-2">
        <Label htmlFor="pv-search">ابحث عن الحالة</Label>
        {/* البحث يعيش داخل النموذج، فـ Enter فيه كان يُرسل الدفعة نفسها — قبل
            اختيار الحالة وقبل كتابة المبلغ. البحث يبحث؛ الحفظ زرّه أدناه. */}
        <Input
          id="pv-search"
          type="search"
          inputMode="search"
          autoComplete="off"
          className="h-11"
          placeholder="اسم المريض أو رقم الهاتف"
          value={query}
          onChange={(e) => runSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
        />
        {truncated ? (
          <p className="text-muted-foreground text-sm">
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
            value={selectedId}
            onChange={(e) => setChosenId(e.target.value)}
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
          className="h-11 text-base tabular-nums"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        {selected ? (
          <MoneySummary
            figures={[
              { label: "رصيد الحالة", amount: selected.remaining },
              { label: "بعد الدفعة", amount: afterPayment, emphasis: true },
            ]}
          />
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="pv-kind">النوع</Label>
        <NativeSelect
          id="pv-kind"
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as PaymentKind)}
        >
          {PAYMENT_KINDS.map((k) => (
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

      <FormError>{state.error}</FormError>

      <SubmitButton className="h-11 w-full text-base" disabled={results.length === 0}>
        حفظ الدفعة
      </SubmitButton>
    </form>
  );
}
