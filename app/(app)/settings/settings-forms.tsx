"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";
import { Database, ShieldQuestion } from "lucide-react";
import type { Doctor, Settings } from "@/lib/db/schema";

// Only the display fields cross the server/client boundary — secret columns
// (pinHash / sessionSecret) are intentionally excluded.
type SettingsView = Pick<
  Settings,
  | "clinicName"
  | "openingCashBalance"
  | "cashReserveThreshold"
  | "defaultCommissionPct"
  | "labDeductedPerDoctor"
  | "pctAppliedAfterLab"
  | "staffSalaryMode"
>;
import {
  updateGeneral,
  updateAccounting,
  updateDoctorPct,
  changePin,
  backupDb,
  type PinState,
  type SettingsState,
  type BackupFile,
} from "@/lib/actions/settings";
import { formatIQD, formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SubmitButton } from "@/components/forms/submit-button";

function UnconfirmedBadge() {
  return (
    <Badge variant="secondary" className="gap-1 font-normal">
      <ShieldQuestion />
      غير مؤكد — يُراجع مع العيادة
    </Badge>
  );
}

/**
 * كل نموذج إعدادات يُظهر نتيجة صريحة. بدون هذا كان الإدخال المرفوض يبدو
 * محفوظاً بينما لم يُكتب شيء. [D1]
 */
function useSettingsForm(
  action: (prev: SettingsState, data: FormData) => Promise<SettingsState>,
  successMessage: string,
) {
  const [state, formAction] = useActionState<SettingsState, FormData>(action, {});
  const seen = useRef<SettingsState | null>(null);

  useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (state.ok) toast.success(successMessage);
  }, [state, successMessage]);

  return { state, formAction };
}

function FormError({ state }: { state: SettingsState }) {
  if (!state.error) return null;
  return (
    <p role="alert" className="text-destructive text-sm">
      {state.error}
    </p>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${formatNumber(Math.round(bytes / 1024))} ك.ب`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
}

// ── العيادة ──────────────────────────────────────────────────────────────────
function GeneralSection({ settings }: { settings: SettingsView }) {
  const { state, formAction } = useSettingsForm(updateGeneral, "تم حفظ بيانات العيادة");
  return (
    <form action={formAction}>
      <Card>
        <CardHeader>
          <CardTitle>العيادة</CardTitle>
          <CardDescription>اسم العيادة والرصيد النقدي الافتتاحي.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="clinicName">اسم العيادة</Label>
            <Input
              id="clinicName"
              name="clinicName"
              defaultValue={settings.clinicName}
              required
              autoComplete="off"
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="openingCashBalance">الرصيد النقدي الافتتاحي (د.ع)</Label>
            <Input
              id="openingCashBalance"
              name="openingCashBalance"
              defaultValue={settings.openingCashBalance}
              inputMode="numeric"
              dir="ltr"
              autoComplete="off"
              className="money h-11 text-start"
            />
            <p className="text-muted-foreground text-xs">
              النقد الموجود في الصندوق قبل بدء التسجيل في النظام. يدخل في حساب النقد المتوفر.
            </p>
          </div>
          <FormError state={state} />
        </CardContent>
        <CardFooter>
          <SubmitButton className="h-11 w-full sm:ms-auto sm:w-auto">حفظ</SubmitButton>
        </CardFooter>
      </Card>
    </form>
  );
}

// ── إعدادات الحساب ───────────────────────────────────────────────────────────
function AccountingSection({ settings }: { settings: SettingsView }) {
  const { state, formAction } = useSettingsForm(
    updateAccounting,
    "تم حفظ إعدادات الحساب",
  );
  return (
    <form action={formAction}>
      <Card>
        <CardHeader>
          <CardTitle>إعدادات الحساب</CardTitle>
          <CardDescription>
            أرقام مبدئية غير مؤكدة — تُراجَع مع العيادة قبل اعتمادها في الحصيلة الشهرية.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* حد الاحتياطي النقدي */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="cashReserveThreshold">حد الاحتياطي النقدي (د.ع)</Label>
              <UnconfirmedBadge />
            </div>
            <Input
              id="cashReserveThreshold"
              name="cashReserveThreshold"
              defaultValue={settings.cashReserveThreshold}
              inputMode="numeric"
              dir="ltr"
              autoComplete="off"
              className="money h-11 text-start"
            />
            <p className="text-muted-foreground text-xs">
              يظهر تنبيه عندما يتجاوز النقد المتوفر هذا الحد (حالياً {formatIQD(settings.cashReserveThreshold)}).
            </p>
          </div>

          {/* النسبة الافتراضية */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="defaultCommissionPct">نسبة الطبيب الافتراضية (%)</Label>
              <UnconfirmedBadge />
            </div>
            <Input
              id="defaultCommissionPct"
              name="defaultCommissionPct"
              type="number"
              min={0}
              max={100}
              defaultValue={settings.defaultCommissionPct}
              inputMode="numeric"
              dir="ltr"
              autoComplete="off"
              className="h-11 w-32 text-start"
            />
            <p className="text-muted-foreground text-xs">
              تُستخدم للأطباء الذين لم تُحدَّد نسبتهم بعد.
            </p>
          </div>

          {/* خصم المختبر من الطبيب */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="labDeductedPerDoctor">خصم المختبر من الطبيب</Label>
                <UnconfirmedBadge />
              </div>
              <p className="text-muted-foreground text-xs">
                عند التفعيل، يُخصم ثمن المختبر من حصة الطبيب.
              </p>
            </div>
            <Switch
              id="labDeductedPerDoctor"
              name="labDeductedPerDoctor"
              defaultChecked={settings.labDeductedPerDoctor}
              className="mt-1 shrink-0"
            />
          </div>

          {/* احتساب النسبة بعد المختبر */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="pctAppliedAfterLab">احتساب النسبة بعد خصم المختبر</Label>
                <UnconfirmedBadge />
              </div>
              <p className="text-muted-foreground text-xs">
                يُستخدم فقط إذا خُصم المختبر من الطبيب.
              </p>
            </div>
            <Switch
              id="pctAppliedAfterLab"
              name="pctAppliedAfterLab"
              defaultChecked={settings.pctAppliedAfterLab}
              className="mt-1 shrink-0"
            />
          </div>

          {/* طريقة الرواتب */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="staffSalaryMode">طريقة رواتب الموظفين</Label>
              <UnconfirmedBadge />
            </div>
            <Input
              id="staffSalaryMode"
              name="staffSalaryMode"
              defaultValue={settings.staffSalaryMode}
              required
              autoComplete="off"
              className="h-11"
            />
            <p className="text-muted-foreground text-xs">مثال: راتب ثابت شهري، أو إدخال يدوي.</p>
          </div>

          <FormError state={state} />
        </CardContent>
        <CardFooter>
          <SubmitButton className="h-11 w-full sm:ms-auto sm:w-auto">
            حفظ إعدادات الحساب
          </SubmitButton>
        </CardFooter>
      </Card>
    </form>
  );
}

// ── نِسَب الأطباء ─────────────────────────────────────────────────────────────
function DoctorRow({ doctor }: { doctor: Doctor }) {
  const { state, formAction } = useSettingsForm(
    updateDoctorPct,
    `تم حفظ بيانات ${doctor.name}`,
  );

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-3 border-b pb-3 last:border-0 last:pb-0"
    >
      <input type="hidden" name="doctorId" value={doctor.id} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{doctor.name}</span>
          {doctor.isOwner ? <Badge variant="outline">المالك</Badge> : null}
          {doctor.doesOrtho ? <Badge variant="outline">تقويم</Badge> : null}
          {doctor.commissionPct == null ? <UnconfirmedBadge /> : null}
        </div>
        <FormError state={state} />
      </div>

      <label className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-input px-3">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={doctor.isActive}
          className="size-5 accent-primary"
        />
        <span className="text-sm">مُفعَّل</span>
      </label>

      <div className="space-y-1">
        <Label htmlFor={`pct_${doctor.id}`} className="text-muted-foreground text-xs">
          النسبة (%)
        </Label>
        <Input
          id={`pct_${doctor.id}`}
          name="commissionPct"
          type="number"
          min={0}
          max={100}
          defaultValue={doctor.commissionPct ?? ""}
          placeholder="—"
          inputMode="numeric"
          dir="ltr"
          autoComplete="off"
          aria-label={`نسبة ${doctor.name}`}
          className="h-11 w-24 text-start"
        />
      </div>
      <SubmitButton size="sm" className="h-11 px-4">
        حفظ
      </SubmitButton>
    </form>
  );
}

function DoctorsSection({ doctors }: { doctors: Doctor[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>الأطباء والنِّسَب</CardTitle>
        <CardDescription>
          نسبة كل طبيب من المبلغ المحصَّل (%). اتركها فارغة إن لم تُؤكَّد بعد —
          عندها تُستخدم النسبة الافتراضية أعلاه. إلغاء التفعيل يُخفي الطبيب من
          قوائم الاختيار دون المساس بحساباته السابقة.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {doctors.map((d) => (
          <DoctorRow key={d.id} doctor={d} />
        ))}
      </CardContent>
    </Card>
  );
}

// ── رمز الدخول ───────────────────────────────────────────────────────────────
function PinSection() {
  const [state, formAction] = useActionState<PinState, FormData>(changePin, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      toast.success("تم تغيير رمز الدخول");
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction}>
      <Card>
        <CardHeader>
          <CardTitle>رمز الدخول</CardTitle>
          <CardDescription>غيّر رمز الدخول المشترك للعيادة.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="oldPin">الرمز الحالي</Label>
            <Input
              id="oldPin"
              name="oldPin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              className="h-11 text-center tracking-widest"
              placeholder="••••"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPin">الرمز الجديد</Label>
            <Input
              id="newPin"
              name="newPin"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              className="h-11 text-center tracking-widest"
              placeholder="••••"
            />
            <p className="text-muted-foreground text-xs">4 أرقام على الأقل.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPin">تأكيد الرمز الجديد</Label>
            <Input
              id="confirmPin"
              name="confirmPin"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              className="h-11 text-center tracking-widest"
              placeholder="••••"
            />
            <p className="text-muted-foreground text-xs">
              أعد كتابة الرمز الجديد. خطأ مطبعي هنا يعني فقدان الدخول إلى النظام.
            </p>
          </div>
          {state.error ? (
            <p role="alert" className="text-destructive text-sm">
              {state.error}
            </p>
          ) : null}
        </CardContent>
        <CardFooter>
          <SubmitButton pendingText="جارٍ التغيير…" className="h-11 w-full sm:ms-auto sm:w-auto">
            تغيير الرمز
          </SubmitButton>
        </CardFooter>
      </Card>
    </form>
  );
}

// ── النسخ الاحتياطي ──────────────────────────────────────────────────────────
function BackupSection({ backups }: { backups: BackupFile[] }) {
  const [pending, startTransition] = useTransition();

  function handleBackup() {
    startTransition(async () => {
      const res = await backupDb();
      if (res.ok) {
        toast.success("تم إنشاء النسخة الاحتياطية", { description: res.file });
      } else {
        toast.error("تعذّر إنشاء النسخة", { description: res.error });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>النسخ الاحتياطي</CardTitle>
        <CardDescription>
          احفظ نسخة من قاعدة البيانات في مجلد <span dir="ltr">backups</span> داخل المشروع.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          type="button"
          onClick={handleBackup}
          disabled={pending}
          className="h-11 w-full sm:w-auto"
        >
          <Database className="size-4" />
          {pending ? "جارٍ النسخ…" : "نسخ قاعدة البيانات الآن"}
        </Button>

        {backups.length > 0 ? (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium">النسخ المحفوظة</p>
            <ul className="divide-y rounded-lg border">
              {backups.map((b) => (
                <li key={b.name} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="truncate font-mono text-xs" dir="ltr">
                    {b.name}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {formatBytes(b.size)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">لا توجد نسخ محفوظة بعد.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function SettingsForms({
  settings,
  doctors,
  backups,
}: {
  settings: SettingsView;
  doctors: Doctor[];
  backups: BackupFile[];
}) {
  return (
    <div className="space-y-6">
      <GeneralSection settings={settings} />
      <AccountingSection settings={settings} />
      <DoctorsSection doctors={doctors} />
      <PinSection />
      <BackupSection backups={backups} />
    </div>
  );
}
