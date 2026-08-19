"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  findOrCreatePatient,
  createAppointment,
  setAppointmentStatus,
  deleteAppointment,
} from "@/lib/mutations";
import { appointmentById } from "@/lib/queries";
import {
  todayISO,
  isValidISODate,
  shiftISOByDays,
  shiftISOByMonths,
} from "@/lib/dates";
import { requireAuth } from "@/lib/auth";

export type ApptState = { ok?: boolean; error?: string };

function revalidateAppointments() {
  revalidatePath("/appointments");
  revalidatePath("/dashboard");
}

// ── حجز موعد ─────────────────────────────────────────────────────────────────
// السجل الرئيسي يحمل الاسم والموعد فقط — بلا تفاصيل علاجية، حسب طلب العيادة.
const bookSchema = z.object({
  patientName: z.string().trim().min(1, "اسم المراجع مطلوب"),
  phone: z.string().trim().optional().default(""),
  doctorId: z.string().optional().default(""),
  apptDate: z.string().optional().default(""),
  note: z.string().trim().optional().default(""),
});

export async function bookAppointment(
  _prev: ApptState,
  formData: FormData,
): Promise<ApptState> {
  await requireAuth();
  const parsed = bookSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "تحقّق من البيانات المُدخلة" };
  }
  const d = parsed.data;

  const apptDate = isValidISODate(d.apptDate) ? d.apptDate : todayISO();

  // "بلا طبيب" يُقبل — أحياناً يُحجز الموعد قبل تحديد الطبيب.
  let doctorId: number | null = null;
  if (d.doctorId.trim() !== "") {
    const n = Number(d.doctorId);
    if (!Number.isInteger(n) || n <= 0) return { error: "اختر طبيباً صحيحاً" };
    doctorId = n;
  }

  const patientId = findOrCreatePatient({
    fullName: d.patientName,
    phone: d.phone || null,
  });

  createAppointment({ patientId, doctorId, apptDate, note: d.note || null });

  revalidateAppointments();
  return { ok: true };
}

// ── حضر / لم يحضر ────────────────────────────────────────────────────────────
const statusSchema = z.object({
  id: z.coerce.number().int().positive(),
  status: z.enum(["booked", "came", "no_show"]),
});

export async function markAppointment(
  _prev: ApptState,
  formData: FormData,
): Promise<ApptState> {
  await requireAuth();
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "تعذّر تحديث الموعد" };

  if (!setAppointmentStatus(parsed.data.id, parsed.data.status)) {
    return { error: "لم يتم العثور على الموعد" };
  }

  revalidateAppointments();
  return { ok: true };
}

// ── حذف موعد ─────────────────────────────────────────────────────────────────
const idSchema = z.object({ id: z.coerce.number().int().positive() });

export async function removeAppointment(
  _prev: ApptState,
  formData: FormData,
): Promise<ApptState> {
  await requireAuth();
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "موعد غير صالح" };

  if (!deleteAppointment(parsed.data.id)) {
    return { error: "لم يتم العثور على الموعد" };
  }

  revalidateAppointments();
  return { ok: true };
}

// ── إعادة حجز ────────────────────────────────────────────────────────────────
/**
 * «إعادة حجز» يفتح موعداً جديداً بعد المدة المختارة ولا يمسّ الموعد الأصلي:
 * سجل المواعيد سِجل، والمريض الذي حضر اليوم يبقى مسجّلاً أنه حضر. المريض
 * والطبيب يُنسخان من الموعد القديم حتى لا يُعاد إدخالهما. [2026-08-19]
 */
const REBOOK_OFFSETS = {
  week: { days: 7 },
  month: { months: 1 },
  two_months: { months: 2 },
  three_months: { months: 3 },
} as const;

export type RebookOffset = keyof typeof REBOOK_OFFSETS;

const rebookSchema = z.object({
  id: z.coerce.number().int().positive(),
  offset: z.enum(["week", "month", "two_months", "three_months"]),
});

export async function rebookAppointment(
  _prev: ApptState,
  formData: FormData,
): Promise<ApptState> {
  await requireAuth();
  const parsed = rebookSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "تعذّرت إعادة الحجز" };

  const existing = appointmentById(parsed.data.id);
  if (!existing) return { error: "لم يتم العثور على الموعد" };

  // القياس من تاريخ الموعد نفسه لا من اليوم: «بعد شهر» تعني بعد شهر من الزيارة.
  const spec = REBOOK_OFFSETS[parsed.data.offset];
  const nextDate =
    "days" in spec
      ? shiftISOByDays(existing.apptDate, spec.days)
      : shiftISOByMonths(existing.apptDate, spec.months);

  createAppointment({
    patientId: existing.patientId,
    doctorId: existing.doctorId,
    apptDate: nextDate,
    note: existing.note,
  });

  revalidateAppointments();
  return { ok: true };
}
