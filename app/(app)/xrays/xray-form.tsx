"use client";

import { useActionState, useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/forms/native-select";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionToast } from "@/components/forms/use-action-toast";
import { formatIQD } from "@/lib/format";
import {
  recordXrayAction,
  searchPatientsForXray,
  type PatientOption,
  type XrayFormState,
} from "@/lib/actions/xrays";

type DoctorOpt = { id: number; name: string };
type XrayTypeOpt = { id: number; nameAr: string };

/** القيمة التي تعني «مريض جديد» في قائمة المرضى. */
const NEW_PATIENT = "";

/**
 * إضافة صورة أشعة.
 *
 * لا سعر مقترَح لأي نوع: سعر الصورة يختلف من حالة إلى أخرى، فيبدأ الحقلان
 * «السعر» و«المدفوع الآن» فارغين ويُكتبان يدوياً. السطر أسفل النموذج يحسب
 * المطلوب والباقي أولاً بأول، وما بقي يظهر في «الديون».
 */
export function XrayForm({
  doctors,
  types,
  today,
  recentPatients,
}: {
  doctors: DoctorOpt[];
  types: XrayTypeOpt[];
  today: string;
  recentPatients: PatientOption[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [state, formAction] = useActionState<XrayFormState, FormData>(recordXrayAction, {});

  const first = types[0];
  const [typeId, setTypeId] = useState(first ? String(first.id) : "");
  const [price, setPrice] = useState("");
  const [discount, setDiscount] = useState("0");
  const [paidNow, setPaidNow] = useState("");

  // اختيار مريض موجود هو الوضع الافتراضي؛ «مريض جديد» قرار واعٍ لا نتيجة كتابة.
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientOption[]>(recentPatients);
  const [patientId, setPatientId] = useState(
    recentPatients[0] ? String(recentPatients[0].id) : NEW_PATIENT,
  );
  const [searching, startSearch] = useTransition();
  const latest = useRef(0);

  function runSearch(next: string) {
    setQuery(next);
    const ticket = ++latest.current;
    startSearch(async () => {
      const found = await searchPatientsForXray(next);
      // تجاهُل نتيجة متأخّرة لطلب قديم حتى لا تستبدل الأحدث.
      if (ticket !== latest.current) return;
      setResults(found);
      setPatientId(found[0] ? String(found[0].id) : NEW_PATIENT);
    });
  }

  useActionToast(
    state,
    "تم حفظ الأشعة",
    useCallback(() => {
      formRef.current?.reset();
      const t = types[0];
      setTypeId(t ? String(t.id) : "");
      setPrice("");
      setDiscount("0");
      setPaidNow("");
      setQuery("");
      setResults(recentPatients);
      setPatientId(recentPatients[0] ? String(recentPatients[0].id) : NEW_PATIENT);
      router.refresh();
    }, [router, types, recentPatients]),
  );

  // المجموع للعرض فقط؛ الحساب المعتمد يجري على الخادم.
  const digits = (v: string) => Math.max(0, Number(v.replace(/[^\d]/g, "")) || 0);
  const total = Math.max(0, digits(price) - digits(discount));
  const remaining = Math.max(0, total - digits(paidNow));

  if (types.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-8 text-center text-sm">
          لا توجد أنواع أشعة مُفعّلة.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="size-4" />
          أشعة جديدة
        </CardTitle>
        <CardDescription>
          اسم الطبيب للمتابعة فقط — دخل الأشعة يعود للعيادة ولا يدخل في حصة
          الطبيب الشهرية.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="space-y-3">
          {/* المريض: ابحث واختر الموجود، ولا تُنشئ سجلاً جديداً إلا بقصد. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="xr-search">ابحث عن المريض</Label>
              <Input
                id="xr-search"
                type="search"
                inputMode="search"
                autoComplete="off"
                className="h-11"
                placeholder="الاسم أو رقم الهاتف"
                value={query}
                onChange={(e) => runSearch(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="xr-patient">المريض</Label>
              <NativeSelect
                id="xr-patient"
                name="patientId"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
              >
                {results.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
                <option value={NEW_PATIENT}>+ مريض جديد</option>
              </NativeSelect>
              {searching ? (
                <p className="text-muted-foreground text-xs">جارٍ البحث…</p>
              ) : results.length === 0 && query.trim() !== "" ? (
                <p className="text-muted-foreground text-xs">
                  لا يوجد مريض بهذا الاسم — سيُضاف كمريض جديد.
                </p>
              ) : null}
            </div>
          </div>

          {patientId === NEW_PATIENT ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="xr-name">اسم المريض الجديد</Label>
                <Input
                  id="xr-name"
                  name="patientName"
                  required
                  autoComplete="off"
                  placeholder="الاسم الكامل"
                  defaultValue={query.trim()}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="xr-phone">رقم الهاتف (اختياري)</Label>
                <Input
                  id="xr-phone"
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="07XXXXXXXXX"
                  className="h-11"
                />
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="xr-type">نوع الأشعة</Label>
              <NativeSelect
                id="xr-type"
                name="treatmentTypeId"
                value={typeId}
                onChange={(e) => setTypeId(e.target.value)}
              >
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nameAr}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="xr-doctor">الطبيب</Label>
              <NativeSelect
                id="xr-doctor"
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

            <div className="space-y-1.5">
              <Label htmlFor="xr-price">السعر (د.ع)</Label>
              <Input
                id="xr-price"
                name="price"
                inputMode="numeric"
                className="h-11"
                placeholder="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="xr-discount">الخصم (د.ع)</Label>
              <Input
                id="xr-discount"
                name="discount"
                inputMode="numeric"
                className="h-11"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="xr-paid">المدفوع الآن (د.ع)</Label>
              <Input
                id="xr-paid"
                name="paidNow"
                inputMode="numeric"
                className="h-11"
                placeholder="0"
                value={paidNow}
                onChange={(e) => setPaidNow(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="xr-date">التاريخ</Label>
              <Input
                id="xr-date"
                name="date"
                type="date"
                defaultValue={today}
                className="h-11"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="xr-note">ملاحظة (اختياري)</Label>
            <Input id="xr-note" name="note" className="h-11" placeholder="السن أو الجهة المطلوبة" />
          </div>

          {/* حساب حيّ للعرض فقط. «مدفوع بالكامل» لا تظهر ما لم يُكتب سعر بعد،
              حتى لا يقرأها الموظف على نموذج فارغ. */}
          <p className="text-muted-foreground text-sm">
            المطلوب <span className="money font-semibold">{formatIQD(total)}</span>
            {remaining > 0 ? (
              <>
                {" "}· يبقى على المريض{" "}
                <span className="money font-semibold">{formatIQD(remaining)}</span> ويظهر في
                «الديون»
              </>
            ) : total > 0 ? (
              " · مدفوع بالكامل"
            ) : null}
          </p>

          {state.error ? <p className="text-destructive text-sm">{state.error}</p> : null}

          <div className="flex justify-end pt-1">
            <SubmitButton className="h-11 w-full sm:w-auto">حفظ الأشعة</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
