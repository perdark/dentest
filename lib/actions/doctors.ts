"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  createDoctor,
  updateDoctor,
  addLabEntry,
  deleteLabEntry,
  findOrCreatePatient,
} from "@/lib/mutations";
import { todayISO, isValidISODate } from "@/lib/dates";
import { parseAmount } from "@/lib/format";
import { requireAuth } from "@/lib/auth";

export type DoctorState = { ok?: boolean; error?: string };

function revalidateDoctors(id?: number) {
  revalidatePath("/doctors");
  if (id) revalidatePath(`/doctors/${id}`);
  revalidatePath("/settlement");
}

// ── إضافة طبيب ───────────────────────────────────────────────────────────────
const createSchema = z.object({
  name: z.string().trim().min(1, "اسم الطبيب مطلوب"),
  commissionPct: z.string().optional().default(""),
  labName: z.string().trim().optional().default(""),
  doesOrtho: z.string().optional(),
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
    isActive: d.isActive === "on",
  });

  revalidateDoctors(d.id);
  return { ok: true };
}

// ── قيد مختبر ────────────────────────────────────────────────────────────────
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

  // ربط القيد بمريض اختياري — كثير من قيود المختبر حساب شهري بلا مريض بعينه.
  const patientId = d.patientName ? findOrCreatePatient({ fullName: d.patientName }) : null;

  addLabEntry({
    doctorId: d.doctorId,
    branch: d.branch,
    entryDate: isValidISODate(d.entryDate) ? d.entryDate : todayISO(),
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
  if (!parsed.success) return { error: "قيد غير صالح" };

  if (!deleteLabEntry(parsed.data.id)) return { error: "لم يتم العثور على القيد" };

  revalidateDoctors(parsed.data.doctorId);
  return { ok: true };
}
