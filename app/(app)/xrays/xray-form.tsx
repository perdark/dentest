"use client";

import { useActionState, useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/forms/native-select";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionToast } from "@/components/forms/use-action-toast";
import { FormError } from "@/components/forms/form-error";
import { XRAY_PLACEMENT_LABELS } from "@/lib/strings";
import { recordXrayAction, type XrayFormState } from "@/lib/actions/xrays";
import { EARLIEST_RECORD_DATE } from "@/lib/dates";

type XrayTypeOpt = { id: number; nameAr: string };

/**
 * تسجيل صورة أشعة — ثلاثة حقول لا أكثر. [قرار العيادة 2026-08-25]
 *
 * كان النموذج يفتح «حالة» على مريض بسعر وخصم ومدفوع الآن، فتلاحق الصورةُ
 * المريضَ في «الديون» شهوراً. العيادة قالت إن الصورة بيع نقدي في لحظته: نوعها،
 * وهل صُوِّرت داخل العيادة أم جاءت من خارجها، وسعرها. لا اسم ولا طبيب ولا دَين
 * — والسعر يدخل صندوق العيادة بتاريخه.
 *
 * لا سعر مقترَح لأي نوع: سعر الصورة يختلف من حالة إلى أخرى فيُكتب يدوياً.
 */
export function XrayForm({ types, today }: { types: XrayTypeOpt[]; today: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [state, formAction] = useActionState<XrayFormState, FormData>(recordXrayAction, {});

  const first = types[0];
  const [typeId, setTypeId] = useState(first ? String(first.id) : "");
  const [price, setPrice] = useState("");

  useActionToast(
    state,
    "تم حفظ الأشعة",
    useCallback(() => {
      formRef.current?.reset();
      const t = types[0];
      setTypeId(t ? String(t.id) : "");
      setPrice("");
      router.refresh();
    }, [router, types]),
  );

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
          السعر يُقبض مع الصورة ويدخل صندوق العيادة بتاريخه — دخل الأشعة يعود
          للعيادة ولا يدخل في حصة أي طبيب.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="space-y-3">
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

            {/* داخل أم خارج — وصفٌ للمتابعة، والاثنان دخل للعيادة. */}
            <div className="space-y-1.5">
              <Label htmlFor="xr-placement">داخل أم خارج</Label>
              <NativeSelect id="xr-placement" name="placement" defaultValue="internal">
                <option value="internal">{XRAY_PLACEMENT_LABELS.internal}</option>
                <option value="external">{XRAY_PLACEMENT_LABELS.external}</option>
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="xr-price">السعر (د.ع)</Label>
              <Input
                id="xr-price"
                name="price"
                inputMode="numeric"
                required
                className="h-11 text-base tabular-nums"
                placeholder="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="xr-date">التاريخ</Label>
              <Input
                id="xr-date"
                name="date"
                type="date"
                defaultValue={today}
                min={EARLIEST_RECORD_DATE}
                max={today}
                className="h-11"
              />
            </div>
          </div>

          <FormError>{state.error}</FormError>

          <div className="flex justify-end pt-1">
            <SubmitButton className="h-11 w-full sm:w-auto">حفظ الأشعة</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
