"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  createPatient as createPatientMutation,
  updatePatient as updatePatientMutation,
  createCaseWithTeeth,
  findOrCreateTreatmentType,
  toothMarkFailureMessage,
  treatmentTypeFailureMessage,
} from "@/lib/mutations";
import { listDoctors, patientById, patientsList } from "@/lib/queries";
import { requireAuth } from "@/lib/auth";
import { MEDICAL_FLAGS } from "@/lib/strings";
import { parseAmount } from "@/lib/format";
import { isRecordableDate } from "@/lib/dates";
import { toothMarksSchema, toToothMarkInputs } from "@/lib/tooth-marks";

export type PatientFormState = { error?: string; ok?: boolean };

const patientSchema = z.object({
  fullName: z.string().trim().min(1, "اسم المريض مطلوب"),
  phone: z.string().trim().optional().default(""),
  address: z.string().trim().optional().default(""),
  notes: z.string().trim().optional().default(""),
  medicalFlags: z.array(z.enum(MEDICAL_FLAGS)).default([]),
  medicalNotes: z.string().trim().optional().default(""),
  doctorId: z.string().optional().default(""),
});

const updatePatientSchema = patientSchema.extend({
  id: z.coerce.number().int().positive(),
});

/**
 * The ticked conditions, read the way checkboxes actually arrive.
 *
 * They share one field name, so `Object.fromEntries` would keep the last box
 * only. Unknown keys are dropped rather than rejected: they cannot come from
 * the clinic's own form, and a hand-made request should not be able to hand the
 * secretary a validation error she has no way to act on.
 */
function readMedicalFlags(formData: FormData): string[] {
  const known = new Set<string>(MEDICAL_FLAGS);
  return formData
    .getAll("medicalFlags")
    .filter((v): v is string => typeof v === "string" && known.has(v));
}

function patientFormValues(formData: FormData) {
  return { ...Object.fromEntries(formData), medicalFlags: readMedicalFlags(formData) };
}

/**
 * «الطبيب المسؤول» as the select actually sends it — required.
 *
 * `required` on the element only guards a browser that runs the check, so the
 * empty answer is refused here too: the server is what decides, not the form.
 *
 * The id is checked against the *whole* doctors table rather than the active
 * ones, so editing the file of a patient registered under a doctor who has
 * since been deactivated keeps his doctor instead of dropping it — and so an
 * id that exists nowhere is refused in Arabic instead of surfacing as a raw
 * foreign-key error.
 */
function readDoctorId(raw: string): { doctorId: number } | { error: string } {
  if (raw.trim() === "") return { error: "اختر الطبيب المسؤول" };
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return { error: "اختر طبيباً صحيحاً" };
  if (!listDoctors().some((d) => d.id === n)) return { error: "اختر طبيباً صحيحاً" };
  return { doctorId: n };
}

/** إضافة مريض جديد (useActionState). */
export async function createPatientAction(
  _prev: PatientFormState,
  formData: FormData,
): Promise<PatientFormState> {
  await requireAuth();
  const parsed = patientSchema.safeParse(patientFormValues(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "تحقّق من البيانات المُدخلة" };
  }
  const { fullName, phone, address, notes, medicalFlags, medicalNotes } = parsed.data;
  const doctor = readDoctorId(parsed.data.doctorId);
  if ("error" in doctor) return { error: doctor.error };
  createPatientMutation({
    fullName,
    phone: phone || null,
    address: address || null,
    notes: notes || null,
    medicalFlags,
    medicalNotes: medicalNotes || null,
    doctorId: doctor.doctorId,
  });
  revalidatePath("/patients");
  return { ok: true };
}

/** تعديل بيانات مريض موجود (useActionState). */
export async function updatePatientAction(
  _prev: PatientFormState,
  formData: FormData,
): Promise<PatientFormState> {
  await requireAuth();
  const parsed = updatePatientSchema.safeParse(patientFormValues(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "تحقّق من البيانات المُدخلة" };
  }
  const { id, fullName, phone, address, notes, medicalFlags, medicalNotes } = parsed.data;
  const doctor = readDoctorId(parsed.data.doctorId);
  if ("error" in doctor) return { error: doctor.error };
  updatePatientMutation(id, {
    fullName,
    phone: phone || null,
    address: address || null,
    notes: notes || null,
    medicalFlags,
    medicalNotes: medicalNotes || null,
    doctorId: doctor.doctorId,
  });
  revalidatePath("/patients");
  revalidatePath(`/patients/${id}`);
  return { ok: true };
}

// ── البحث عن مريض مسجّل (الدفتر اليومي، الزراعة) ─────────────────────────────
export type PatientMatch = { id: number; fullName: string; phone: string | null };

/**
 * Up to eight patients whose name or phone contains `q` — what the «مريض مسجّل»
 * picker lists while the clerk types. The same `patientsList` search the
 * «المرضى» screen runs, so the two can never disagree about who matches.
 */
export async function searchPatientsAction(q: string): Promise<PatientMatch[]> {
  await requireAuth();
  const term = typeof q === "string" ? q.trim().slice(0, 80) : "";
  if (!term) return [];
  return patientsList({ q: term }, 8).map((p) => ({
    id: p.id,
    fullName: p.fullName,
    phone: p.phone,
  }));
}

// ── إضافة علاج إلى ملف مريض ──────────────────────────────────────────────────
export type PatientTreatmentState = { ok?: boolean; error?: string };

const treatmentSchema = z.object({
  patientId: z.coerce.number().int().positive(),
  doctorId: z.coerce.number().int().positive("اختر الطبيب"),
  treatmentName: z.string().trim().min(1, "اكتب اسم العلاج"),
  price: z.string().optional().default(""),
  discount: z.string().optional().default(""),
  paidNow: z.string().optional().default(""),
  date: z.string().optional().default(""),
  notes: z.string().trim().max(1000).optional().default(""),
  marks: z.string().optional().default("[]"),
});

/**
 * Open a treatment on an existing patient's file, with its teeth.
 *
 * This is how an old paper patient is brought in: the date may be any day the
 * clinic could have worked (`isRecordableDate`), so a filling done last spring
 * lands in last spring's month — and, exactly like an edit, marks that month
 * stale if it was already closed (D4, owned by the mutations layer). The same
 * free-text treatment rules as «الدفتر اليومي» apply: an implant, ortho or X-ray
 * name is refused here and opened from its own screen (D9).
 */
export async function addPatientTreatmentAction(
  _prev: PatientTreatmentState,
  formData: FormData,
): Promise<PatientTreatmentState> {
  await requireAuth();
  const parsed = treatmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "تحقّق من البيانات المُدخلة" };
  }
  const d = parsed.data;

  if (!patientById(d.patientId)) return { error: "المريض غير موجود" };
  if (!listDoctors().some((doc) => doc.id === d.doctorId)) return { error: "اختر طبيباً صحيحاً" };
  if (!isRecordableDate(d.date)) {
    return { error: "التاريخ غير صحيح — لا يمكن إضافة علاج بتاريخ لاحق لليوم" };
  }

  let rawMarks: unknown;
  try {
    rawMarks = JSON.parse(d.marks);
  } catch {
    return { error: "تعذّرت قراءة مخطط الأسنان" };
  }
  const marks = toothMarksSchema.safeParse(rawMarks);
  if (!marks.success) {
    return { error: marks.error.issues[0]?.message ?? "مخطط الأسنان غير صحيح" };
  }

  // المبالغ تُحسب هنا من جديد — لا يُوثق بأي رقم محسوب في المتصفّح.
  const price = parseAmount(d.price);
  const discount = parseAmount(d.discount);
  const paidNow = parseAmount(d.paidNow);
  if (price < 0 || discount < 0 || paidNow < 0) return { error: "المبالغ يجب أن تكون موجبة" };
  if (discount > price) return { error: "الخصم أكبر من السعر" };
  const total = price - discount;
  if (paidNow > total) return { error: "المدفوع أكبر من إجمالي العلاج" };

  // Last, because it can write: a name nobody has typed before becomes a
  // treatment type. Nothing is created for a form that was going to fail.
  const treatment = findOrCreateTreatmentType(d.treatmentName);
  if (!treatment.ok) return { error: treatmentTypeFailureMessage(treatment.reason) };

  const result = createCaseWithTeeth({
    patientId: d.patientId,
    doctorId: d.doctorId,
    treatmentTypeId: treatment.id,
    openedDate: d.date,
    listPrice: price,
    discount,
    totalPrice: total,
    notes: d.notes || null,
    firstPayment: paidNow > 0 ? { amount: paidNow, kind: "down_payment" } : undefined,
    marks: toToothMarkInputs(marks.data),
  });
  if (!result.ok) return { error: toothMarkFailureMessage(result.reason) };

  revalidatePath(`/patients/${d.patientId}`);
  revalidatePath("/patients");
  revalidatePath("/daily");
  revalidatePath("/debts");
  revalidatePath("/dashboard");
  return { ok: true };
}
