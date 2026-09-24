"use client";

import { useActionState, useCallback, useRef, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/forms/native-select";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionToast } from "@/components/forms/use-action-toast";
import { FormError } from "@/components/forms/form-error";
import { MoneySummary } from "@/components/forms/money-summary";
import { PatientPicker } from "@/components/forms/patient-picker";
import { parseAmount } from "@/lib/format";
import { createVisitNewCase, type VisitFormState } from "@/lib/actions/visits";
import { EARLIEST_RECORD_DATE } from "@/lib/dates";

type DoctorOpt = { id: number; name: string };
type TreatmentOpt = { id: number; nameAr: string };

export function EntryDialog({
  doctors,
  treatments,
  date,
  today,
}: {
  doctors: DoctorOpt[];
  treatments: TreatmentOpt[];
  date: string;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  // الاسم هو أول ما يُكتب في كل تسجيل، فهو أول ما يُركَّز عليه عند الفتح.
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
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md" initialFocus={nameRef}>
        <DialogHeader>
          <DialogTitle>تسجيل جديد</DialogTitle>
          {/* هذه النافذة تفتح حساباً جديداً فقط. تسديد حالة مفتوحة يجري من
              «الديون ← إضافة دفعة» حيث تُختار الحالة برصيدها. */}
          <DialogDescription>
            هذه النافذة تفتح حساب علاج جديد — لمريض جديد أو لمريض مسجّل. إذا
            كان المريض يسدّد على حالة مفتوحة، سجّل الدفعة من شاشة «الديون».
          </DialogDescription>
        </DialogHeader>
        <NewCaseForm
          key={open ? "new-open" : "new-closed"}
          doctors={doctors}
          treatments={treatments}
          date={date}
          today={today}
          nameRef={nameRef}
          onSuccess={handleSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}

// ── Mode A: new case + first payment ─────────────────────────────────────────
function NewCaseForm({
  doctors,
  treatments,
  date,
  today,
  nameRef,
  onSuccess,
}: {
  doctors: DoctorOpt[];
  treatments: TreatmentOpt[];
  date: string;
  today: string;
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
      <PatientPicker idPrefix="nc">
        <div className="space-y-3">
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
        </div>
      </PatientPicker>

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
          {/* لا يُفتح حساب بتاريخ قادم: خطأ رقم واحد في السنة يُخرج الحالة
              ودفعتها الأولى من حساب الشهر بلا أي تنبيه. */}
          <Input
            id="nc-date"
            name="date"
            type="date"
            className="h-11"
            defaultValue={date > today ? today : date}
            min={EARLIEST_RECORD_DATE}
            max={today}
          />
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
