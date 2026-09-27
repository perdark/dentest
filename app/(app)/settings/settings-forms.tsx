"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CircleQuestionMark,
  Database,
  RotateCcw,
  Trash2,
} from "lucide-react";
import type { Settings } from "@/lib/db/schema";

// Only the display fields cross the server/client boundary — secret columns
// (pinHash / sessionSecret) are intentionally excluded.
type SettingsView = Pick<
  Settings,
  | "clinicName"
  | "openingCashBalance"
  | "cashReserveThreshold"
  | "labDeductedPerDoctor"
  | "pctAppliedAfterLab"
>;
import {
  updateGeneral,
  updateAccounting,
  changePin,
  backupDb,
  wipeRecords,
  restoreBackup,
  cancelRestore,
  restartTutorial,
  type PinState,
  type SettingsState,
  type BackupFile,
  type DemoState,
  type RestoreState,
} from "@/lib/actions/settings";
import { formatIQD, formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { NativeSelect } from "@/components/forms/native-select";

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
            <p className="text-muted-foreground text-sm">
              النقد الموجود في الصندوق قبل بدء العمل في النظام. يدخل في حساب النقد المتوفر.
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
            قواعد احتساب حصص الأطباء والحد الأدنى للاحتياطي النقدي.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* نسبة كل طبيب مكانها الوحيد شاشة «الأطباء» — كانت تُعدَّل من ثلاثة
              أماكن (هنا، وملف الطبيب، وجدول الحصيلة) فلا يُعرف أيّها الصحيح.
              السطر يدلّ من يبحث عنها هنا إلى مكانها. [§18] */}
          <p className="bg-muted/40 rounded-lg px-3 py-2.5 text-sm leading-relaxed">
            نسبة كل طبيب وتفعيله يُضبطان من{" "}
            <Link href="/doctors" className="text-primary font-medium underline-offset-4 hover:underline">
              شاشة «الأطباء»
            </Link>
            ، من ملف كل طبيب.
          </p>

          {/* حد الاحتياطي النقدي */}
          <div className="space-y-2">
            <Label htmlFor="cashReserveThreshold">حد الاحتياطي النقدي (د.ع)</Label>
            <Input
              id="cashReserveThreshold"
              name="cashReserveThreshold"
              defaultValue={settings.cashReserveThreshold}
              inputMode="numeric"
              dir="ltr"
              autoComplete="off"
              className="money h-11 text-start"
            />
            <p className="text-muted-foreground text-sm">
              يظهر تنبيه في «الحركات النقدية» عندما يتجاوز النقد المتوفر هذا الحد (حالياً {formatIQD(settings.cashReserveThreshold)}).
            </p>
          </div>

          {/* خصم المختبر من الطبيب */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="labDeductedPerDoctor">خصم المختبر من الطبيب</Label>
              <p className="text-muted-foreground text-sm">
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
              <Label htmlFor="pctAppliedAfterLab">احتساب النسبة بعد خصم المختبر</Label>
              <p className="text-muted-foreground text-sm">
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
      <Card data-tour="settings-pin">
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
            <p className="text-muted-foreground text-sm">4 أرقام على الأقل.</p>
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
            <p className="text-muted-foreground text-sm">
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
    <Card data-tour="settings-backup">
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
            <p className="text-muted-foreground text-sm font-medium">النسخ المحفوظة</p>
            <ul className="divide-y rounded-lg border">
              {backups.map((b) => (
                <li key={b.name} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="truncate font-mono text-sm" dir="ltr">
                    {b.name}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-sm">
                    {formatBytes(b.size)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">لا توجد نسخ محفوظة بعد.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── الاستعادة ────────────────────────────────────────────────────────────────
/**
 * ⚠️ الاستعادة لا تحدث فوراً — تُجهَّز وتُطبَّق عند التشغيل القادم، لأن قاعدة
 * البيانات مفتوحة ما دام البرنامج يعمل. الشاشة تقول ذلك صراحةً: العيادة يجب أن
 * تعرف أن سجلاتها لم تتغيّر بعدُ، وأن الإغلاق وإعادة الفتح هما ما يُتمّان العمل.
 */
function RestoreSection({
  backups,
  pending,
}: {
  backups: BackupFile[];
  pending: string | null;
}) {
  const [state, action] = useActionState<RestoreState, FormData>(restoreBackup, {});
  const seen = useRef<RestoreState | null>(null);
  const [cancelling, startCancel] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    if (state.ok) toast.success("جُهِّزت الاستعادة", { description: state.message });
  }, [state]);

  function handleCancel() {
    startCancel(async () => {
      const res = await cancelRestore();
      if (res.ok) {
        toast.success("أُلغيت الاستعادة", { description: res.message });
        router.refresh();
      } else {
        toast.error("تعذّر الإلغاء", { description: res.error });
      }
    });
  }

  return (
    <Card data-tour="settings-restore">
      <CardHeader>
        <CardTitle>استعادة نسخة محفوظة</CardTitle>
        <CardDescription>
          إرجاع سجلات العيادة إلى ما كانت عليه يوم أُخذت النسخة.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {pending ? (
          <div className="border-primary/40 bg-primary/5 space-y-3 rounded-lg border p-3">
            <p className="text-base font-medium">استعادة بانتظار التشغيل القادم</p>
            <p className="text-muted-foreground text-sm">
              أغلق البرنامج الآن وافتحه من جديد لتُطبَّق. لن يتغيّر شيء قبل ذلك.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={cancelling}
              className="h-11 w-full sm:w-auto"
            >
              {cancelling ? "جارٍ الإلغاء…" : "إلغاء الاستعادة"}
            </Button>
          </div>
        ) : backups.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            لا توجد نسخ محفوظة بعد. خُذ نسخة من القسم أعلاه أولاً.
          </p>
        ) : (
          <form action={action} className="space-y-3 rounded-lg border p-3">
            <p className="text-muted-foreground text-sm">
              تُستبدل كل السجلات الحالية بما في النسخة المختارة.{" "}
              <strong>يُحفظ ما لديك الآن في نسخة جديدة تلقائياً</strong> قبل أي شيء،
              فالتراجع ممكن دائماً.
            </p>
            <div className="space-y-2">
              <Label htmlFor="restore-name">النسخة</Label>
              <NativeSelect id="restore-name" name="name" defaultValue={backups[0].name}>
                {backups.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name} — {formatBytes(b.size)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="restore-confirm">اكتب كلمة «استعادة» للتأكيد</Label>
              <Input
                id="restore-confirm"
                name="confirm"
                autoComplete="off"
                placeholder="استعادة"
                className="h-11 sm:max-w-48"
              />
            </div>
            <FormError state={state} />
            <SubmitButton className="h-11 w-full sm:w-auto">
              <RotateCcw className="size-4" />
              تجهيز الاستعادة
            </SubmitButton>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// ── الشرح التعريفي ───────────────────────────────────────────────────────────
function TutorialSection() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // 🔴 كان الزر يمسح `localStorage` وحده، بينما الجولات المُشاهَدة صارت تُحفظ في
  // قاعدة البيانات (`settings.tours_seen`، انظر lib/tour-state.ts) — فكان يُعلن
  // «سيبدأ الشرح من جديد» ولا يتغيّر شيء. المسح الآن على الخادم.
  function restart() {
    startTransition(async () => {
      const res = await restartTutorial();
      if (!res.ok) {
        toast.error("تعذّرت إعادة الشرح", { description: res.error });
        return;
      }
      // الجولة تفتح وحدها فقط على نظام بلا سجلات (components/tour.tsx) — عيادة تعمل
      // لا تُقاطَع. فالرسالة تقول ما سيحدث فعلاً بدل وعدٍ لا يتحقق.
      toast.success(
        res.autoStart ? "سيبدأ الشرح من جديد" : "أُعيد ضبط الشرح",
        res.autoStart
          ? undefined
          : { description: "اضغط زر «؟» أعلى أي شاشة لبدء شرحها." },
      );
      router.push("/dashboard");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>الشرح التعريفي</CardTitle>
        <CardDescription>
          جولة قصيرة تشرح كل شاشة. تبدأ وحدها أول مرة، ويمكن إعادتها في أي وقت — أو
          فتح «الدليل» من القائمة لقراءة الشرح كاملاً وطباعته.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          onClick={restart}
          disabled={pending}
          className="h-11"
        >
          <CircleQuestionMark className="size-4" />
          {pending ? "جارٍ الإعادة…" : "إعادة تشغيل الشرح"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-11"
          nativeButton={false}
          render={<Link href="/help" />}
        >
          <BookOpen className="size-4" />
          فتح الدليل
        </Button>
      </CardContent>
    </Card>
  );
}

// ── البدء من جديد ────────────────────────────────────────────────────────────
/**
 * Training data is no longer offered — or announced — inside the clinic's own
 * program. Staff who see "تجريبي" on a screen they were told is their records
 * system lose trust in every number on it, and the person handing the laptop
 * over is the one who knows whether it holds practice data. Loading it is a
 * setup step now: `npm run demo`, before the clinic ever opens the app.
 *
 * Wiping stays here, where the owner can reach it: it is how a clinic that
 * trained on sample records starts its real books.
 */
function ResetSection() {
  const [wipeState, wipeAction] = useActionState<DemoState, FormData>(wipeRecords, {});
  const wipeSeen = useRef<DemoState | null>(null);

  useEffect(() => {
    if (wipeState === wipeSeen.current) return;
    wipeSeen.current = wipeState;
    if (wipeState.ok) toast.success("تم مسح السجلات", { description: wipeState.message });
  }, [wipeState]);

  return (
    <Card data-tour="settings-reset">
      <CardHeader>
        <CardTitle>البدء من جديد</CardTitle>
        <CardDescription>
          مسح كل سجلات العيادة والبدء بصفحة بيضاء. الأطباء وأنواع العلاج
          والإعدادات ورمز الدخول تبقى كما هي.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={wipeAction} className="border-destructive/30 space-y-3 rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">مسح كل السجلات</p>
            <p className="text-muted-foreground mt-1 text-sm">
              يحذف المرضى والحالات والدفعات والمواعيد والمصروفات والحركات النقدية
              وسجل التعديلات. <strong>لا يمكن التراجع.</strong>
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              خُذ نسخة احتياطية أولاً من القسم أعلاه إذا كان في النظام أي شيء يهمّك.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wipe-confirm">اكتب كلمة «حذف» للتأكيد</Label>
            <Input
              id="wipe-confirm"
              name="confirm"
              autoComplete="off"
              placeholder="حذف"
              className="h-11 sm:max-w-48"
            />
          </div>
          <FormError state={wipeState} />
          <SubmitButton variant="destructive" className="h-11 w-full sm:w-auto">
            <Trash2 className="size-4" />
            مسح كل السجلات
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

export function SettingsForms({
  settings,
  backups,
  pendingRestoreName,
}: {
  settings: SettingsView;
  backups: BackupFile[];
  pendingRestoreName: string | null;
}) {
  return (
    <div className="space-y-6">
      <GeneralSection settings={settings} />
      <AccountingSection settings={settings} />
      <PinSection />
      <BackupSection backups={backups} />
      <RestoreSection backups={backups} pending={pendingRestoreName} />
      <TutorialSection />
      <ResetSection />
    </div>
  );
}
