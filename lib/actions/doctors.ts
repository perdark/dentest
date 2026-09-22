"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  createDoctor,
  updateDoctor,
  deleteDoctor,
  doctorRefCounts,
  addLabEntry,
  deleteLabEntry,
  findOrCreatePatient,
} from "@/lib/mutations";
import { todayISO, isRecordableDate } from "@/lib/dates";
import { parseAmount } from "@/lib/format";
import { requireAuth } from "@/lib/auth";

export type DoctorState = { ok?: boolean; error?: string };

function revalidateDoctors(id?: number) {
  revalidatePath("/doctors");
  if (id) revalidatePath(`/doctors/${id}`);
  revalidatePath("/settlement");
  // The doctor pickers on these two screens are filtered by the capability
  // checkboxes («زراعة» / «عمل عادي»), so a change here changes what they offer.
  // Without this, a client-side navigation can serve a cached list and the
  // doctor who was just ticked appears to be missing. [pickers]
  revalidatePath("/daily");
  revalidatePath("/implants");
}

// ── إضافة طبيب ───────────────────────────────────────────────────────────────
const createSchema = z.object({
  name: z.string().trim().min(1, "اسم الطبيب مطلوب"),
  commissionPct: z.string().optional().default(""),
  labName: z.string().trim().optional().default(""),
  doesOrtho: z.string().optional(),
  doesImplants: z.string().optional(),
  doesNormal: z.string().optional(),
});

export async function addDoctor(
  _prev: DoctorState,
  formData: FormData,
): Promise<DoctorState> {
  await requireAuth();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "تحقّق من البيانات المُدخلة" };
  }
  const d = parsed.data;

  // النسبة تبقى فارغة إن لم تُحدَّد — الافتراضي في الإعدادات يسري عندها.
  let pct: number | null = null;
  if (d.commissionPct.trim() !== "") {
    const n = Number(d.commissionPct);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return { error: "النسبة يجب أن تكون بين 0 و100" };
    }
    pct = Math.round(n);
  }

  const id = createDoctor({
    name: d.name,
    commissionPct: pct,
    doesOrtho: d.doesOrtho === "on",
    doesImplants: d.doesImplants === "on",
    doesNormal: d.doesNormal === "on",
    labName: d.labName || null,
  });

  revalidateDoctors(id);
  return { ok: true };
}

// ── تعديل بيانات طبيب ────────────────────────────────────────────────────────
const updateSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string().trim().min(1, "اسم الطبيب مطلوب"),
  commissionPct: z.string().optional().default(""),
  labName: z.string().trim().optional().default(""),
  doesOrtho: z.string().optional(),
  doesImplants: z.string().optional(),
  doesNormal: z.string().optional(),
  isActive: z.string().optional(),
});

export async function saveDoctor(
  _prev: DoctorState,
  formData: FormData,
): Promise<DoctorState> {
  await requireAuth();
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "تحقّق من البيانات المُدخلة" };
  }
  const d = parsed.data;

  let pct: number | null = null;
  if (d.commissionPct.trim() !== "") {
    const n = Number(d.commissionPct);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return { error: "النسبة يجب أن تكون بين 0 و100" };
    }
    pct = Math.round(n);
  }

  updateDoctor(d.id, {
    name: d.name,
    commissionPct: pct,
    labName: d.labName || null,
    doesOrtho: d.doesOrtho === "on",
    doesImplants: d.doesImplants === "on",
    doesNormal: d.doesNormal === "on",
    isActive: d.isActive === "on",
  });

  revalidateDoctors(d.id);
  return { ok: true };
}

// ── حذف طبيب ─────────────────────────────────────────────────────────────────
/**
 * حذف طبيب — **فقط إذا ما عنده ولا سجل**.
 *
 * 🔴 `doctors.id` مربوط بخمسة جداول (الحالات · الدفعات · المواعيد · المختبر ·
 * الحصائل الشهرية)، وأربعة منها `NOT NULL`. الحذف الحقيقي إمّا يفشل على
 * المفتاح الأجنبي، أو — الأسوأ — يتّم مبالغ: حالة بنص مليون بلا طبيب، وشهر
 * محسوب ما عاد ينحسب من جديد.
 *
 * فالحذف هنا للحالة الآمنة وحدها: اسم انكتب غلط، أو طبيب انضاف مرتين، قبل ما
 * ينحجز عليه أي شغل. غير هيچ ⇒ **إيقاف** (`isActive: false`)، لأن بدفتر
 * محاسبة الماضي ما يصير كذباً لأن أحداً غادر.
 *
 * ⚠️ العدّ يتكرر **داخل** المعاملة كذلك (`deleteDoctor`) — بين رسم الزر
 * وضغطه ممكن تنحجز حالة.
 */
const deleteSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export async function removeDoctor(
  _prev: DoctorState,
  formData: FormData,
): Promise<DoctorState> {
  await requireAuth();
  const parsed = deleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "طبيب غير صالح" };
  const { id } = parsed.data;

  const refs = doctorRefCounts(id);
  if (refs.total > 0) {
    // رسالة تعدّ الأسباب بدل «ما ينحذف» المجردة — المالك لازم يعرف **ليش**،
    // وإلا يظن البرنامج معطّل.
    const parts: string[] = [];
    if (refs.cases) parts.push(`${refs.cases} حالة`);
    if (refs.payments) parts.push(`${refs.payments} دفعة`);
    if (refs.appointments) parts.push(`${refs.appointments} موعد`);
    if (refs.labEntries) parts.push(`${refs.labEntries} تسجيل مختبر`);
    if (refs.settlements) parts.push(`${refs.settlements} حصيلة شهرية`);
    return {
      error: `ما ينحذف — مربوط بـ${parts.join(" · ")}. حذفه يتّم هذي السجلات. استعمل «موقوف» بدله.`,
    };
  }

  const res = deleteDoctor(id);
  if (!res.ok) {
    // انحجز شي بين الفحص والحذف.
    return { error: "ما ينحذف — انضاف له سجل قبل لحظة. جرّب مرة ثانية." };
  }
  revalidateDoctors(id);
  return { ok: true };
}

// ── تسجيل مختبر ────────────────────────────────────────────────────────────────
const labSchema = z.object({
  doctorId: z.coerce.number().int().positive(),
  branch: z.enum(["fixed", "mobile"]),
  amount: z.string(),
  entryDate: z.string().optional().default(""),
  note: z.string().trim().optional().default(""),
  patientName: z.string().trim().optional().default(""),
});

export async function addLabEntryAction(
  _prev: DoctorState,
  formData: FormData,
): Promise<DoctorState> {
  await requireAuth();
  const parsed = labSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "تحقّق من البيانات المُدخلة" };
  const d = parsed.data;

  const amount = parseAmount(d.amount);
  if (amount === 0) return { error: "أدخل مبلغاً" };

  // ربط التسجيل بمريض اختياري — كثير من تسجيلات المختبر حساب شهري بلا مريض بعينه.
  const patientId = d.patientName ? findOrCreatePatient({ fullName: d.patientName }) : null;

  addLabEntry({
    doctorId: d.doctorId,
    branch: d.branch,
    entryDate: isRecordableDate(d.entryDate) ? d.entryDate : todayISO(),
    amount,
    note: d.note || null,
    patientId,
  });

  revalidateDoctors(d.doctorId);
  return { ok: true };
}

const removeLabSchema = z.object({
  id: z.coerce.number().int().positive(),
  doctorId: z.coerce.number().int().positive(),
});

export async function removeLabEntry(
  _prev: DoctorState,
  formData: FormData,
): Promise<DoctorState> {
  await requireAuth();
  const parsed = removeLabSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "تسجيل غير صالح" };

  if (!deleteLabEntry(parsed.data.id)) return { error: "لم يتم العثور على التسجيل" };

  revalidateDoctors(parsed.data.doctorId);
  return { ok: true };
}
