"use client";

import { useActionState, useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, X, Trash2, RotateCcw, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/forms/native-select";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionToast } from "@/components/forms/use-action-toast";
import {
  bookAppointment,
  markAppointment,
  removeAppointment,
  rebookAppointment,
  type ApptState,
} from "@/lib/actions/appointments";
import { APPT_STATUS_LABELS } from "@/lib/strings";

type DoctorOption = { id: number; name: string };

// ── حجز موعد جديد ────────────────────────────────────────────────────────────
export function BookAppointmentDialog({
  doctors,
  date,
}: {
  doctors: DoctorOption[];
  date: string;
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<ApptState, FormData>(
    bookAppointment,
    {},
  );

  useActionToast(
    state,
    "تم حجز الموعد بنجاح",
    useCallback(() => {
      setOpen(false);
      formRef.current?.reset();
    }, []),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="h-11 gap-1.5">
            <Plus className="size-4" />
            حجز موعد
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>حجز موعد</DialogTitle>
          <DialogDescription>
            الاسم والموعد فقط — تفاصيل العلاج والمبالغ تُسجَّل في الدفتر اليومي.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} action={formAction} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ap-name">اسم المراجع</Label>
            <Input
              id="ap-name"
              name="patientName"
              required
              autoComplete="off"
              className="h-11"
              placeholder="الاسم الكامل"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ap-phone">رقم الهاتف (اختياري)</Label>
            <Input
              id="ap-phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              className="h-11"
              placeholder="07XXXXXXXXX"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ap-doctor">الطبيب</Label>
            <NativeSelect id="ap-doctor" name="doctorId" defaultValue="">
              <option value="">— لم يُحدَّد بعد —</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ap-date">التاريخ</Label>
            <Input
              id="ap-date"
              name="apptDate"
              type="date"
              defaultValue={date}
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ap-note">ملاحظة</Label>
            <Input id="ap-note" name="note" className="h-11" autoComplete="off" />
          </div>

          {state.error ? (
            <p className="text-destructive text-sm">{state.error}</p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <DialogClose
              render={
                <Button type="button" variant="outline" className="h-11">
                  إلغاء
                </Button>
              }
            />
            <SubmitButton className="h-11">حفظ الموعد</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── حضر / لم يحضر / تراجع ────────────────────────────────────────────────────
const STATUS_DONE: Record<"booked" | "came" | "no_show", string> = {
  came: "تم تعليم الحضور",
  no_show: "تم تعليم عدم الحضور",
  booked: "تم التراجع — الموعد محجوز مجدداً",
};

function StatusForm({
  id,
  status,
  children,
  label,
  variant = "outline",
}: {
  id: number;
  status: "booked" | "came" | "no_show";
  children: React.ReactNode;
  label: string;
  variant?: "outline" | "ghost";
}) {
  const [state, formAction, pending] = useActionState<ApptState, FormData>(
    markAppointment,
    {},
  );

  useActionToast(state, STATUS_DONE[status]);

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button
        type="submit"
        variant={variant}
        size="sm"
        className="h-11 gap-1.5"
        disabled={pending}
        aria-label={label}
        title={label}
      >
        {children}
      </Button>
    </form>
  );
}

export function AppointmentActions({
  id,
  status,
  patientName,
}: {
  id: number;
  status: string;
  patientName: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {status === "booked" ? (
        <>
          <StatusForm id={id} status="came" label="حضر">
            <Check className="size-4" />
            حضر
          </StatusForm>
          <StatusForm id={id} status="no_show" label="لم يحضر">
            <X className="size-4" />
            لم يحضر
          </StatusForm>
        </>
      ) : (
        <StatusForm id={id} status="booked" label="إرجاع إلى محجوز" variant="ghost">
          <RotateCcw className="size-4" />
          تراجع
        </StatusForm>
      )}
      {/* إعادة الحجز تُعرض بعد انتهاء الزيارة — وقتها يُحدَّد الموعد القادم. */}
      {status === "came" ? (
        <RebookDialog id={id} patientName={patientName} />
      ) : null}
      <DeleteAppointment id={id} patientName={patientName} />
    </div>
  );
}

// ── حذف موعد ─────────────────────────────────────────────────────────────────
function DeleteAppointment({
  id,
  patientName,
}: {
  id: number;
  patientName: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ApptState, FormData>(
    removeAppointment,
    {},
  );

  useActionToast(
    state,
    "تم حذف الموعد",
    useCallback(() => setOpen(false), []),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive size-11"
            aria-label={`حذف موعد ${patientName}`}
          >
            <Trash2 className="size-4" />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>حذف الموعد</DialogTitle>
          <DialogDescription>
            سيُحذف موعد {patientName} من سجل المواعيد. لا يؤثّر هذا على أي مبالغ
            أو حالات علاج.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={id} />
          {state.error ? (
            <p className="text-destructive text-sm">{state.error}</p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose
              render={
                <Button type="button" variant="outline" className="h-11">
                  تراجع
                </Button>
              }
            />
            <Button
              type="submit"
              variant="destructive"
              className="h-11"
              disabled={pending}
            >
              {pending ? "جارٍ الحذف…" : "تأكيد الحذف"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── مرشّحات السجل ────────────────────────────────────────────────────────────
/**
 * المرشّحات تُطبَّق على الخادم (`appointmentsForDate`) — هذا المكوّن يغيّر الرابط
 * فقط. يبقى `view` و`date` كما هما حتى لا يقفز العرض عند اختيار طبيب.
 */
export function AppointmentFilters({
  doctors,
  date,
  view,
  doctorId,
  status,
}: {
  doctors: DoctorOption[];
  date: string;
  view: string;
  doctorId: string;
  status: string;
}) {
  const router = useRouter();

  function go(next: { doctorId?: string; status?: string }) {
    const q = new URLSearchParams();
    q.set("date", date);
    if (view === "month") q.set("view", "month");
    const d = next.doctorId ?? doctorId;
    const st = next.status ?? status;
    if (d) q.set("doctorId", d);
    if (st) q.set("status", st);
    router.push(`/appointments?${q.toString()}`);
  }

  return (
    <div data-tour="appt-filters" className="flex flex-wrap items-center gap-2">
      <NativeSelect
        aria-label="تصفية حسب الطبيب"
        className="h-11 w-auto min-w-40"
        value={doctorId}
        onChange={(e) => go({ doctorId: e.target.value })}
      >
        <option value="">كل الأطباء</option>
        {doctors.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </NativeSelect>

      <NativeSelect
        aria-label="تصفية حسب الحالة"
        className="h-11 w-auto min-w-36"
        value={status}
        onChange={(e) => go({ status: e.target.value })}
      >
        <option value="">كل الحالات</option>
        {Object.entries(APPT_STATUS_LABELS).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </NativeSelect>

      {doctorId || status ? (
        <Button
          variant="ghost"
          className="h-11"
          onClick={() => go({ doctorId: "", status: "" })}
        >
          إزالة المرشّحات
        </Button>
      ) : null}
    </div>
  );
}

// ── إعادة حجز ────────────────────────────────────────────────────────────────
const REBOOK_CHIPS = [
  { offset: "week", label: "+ أسبوع" },
  { offset: "month", label: "+ شهر" },
  { offset: "two_months", label: "+ شهرين" },
  { offset: "three_months", label: "+ ٣ أشهر" },
] as const;

function RebookDialog({ id, patientName }: { id: number; patientName: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ApptState, FormData>(
    rebookAppointment,
    {},
  );

  useActionToast(
    state,
    "تم حجز الموعد القادم",
    useCallback(() => setOpen(false), []),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="h-11 gap-1.5"
            aria-label={`إعادة حجز ${patientName}`}
          >
            <CalendarPlus className="size-4" />
            إعادة حجز
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>إعادة حجز {patientName}</DialogTitle>
          <DialogDescription>
            يُفتح موعد جديد بعد المدة المختارة، ويبقى موعد اليوم في السجل كما هو.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={id} />
          <div className="grid grid-cols-2 gap-2">
            {REBOOK_CHIPS.map((c) => (
              <Button
                key={c.offset}
                type="submit"
                name="offset"
                value={c.offset}
                variant="outline"
                className="h-11"
                disabled={pending}
              >
                {c.label}
              </Button>
            ))}
          </div>
          {state.error ? (
            <p className="text-destructive text-sm">{state.error}</p>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
