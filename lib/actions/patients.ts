"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  createPatient as createPatientMutation,
  updatePatient as updatePatientMutation,
} from "@/lib/mutations";
import { listDoctors } from "@/lib/queries";
import { requireAuth } from "@/lib/auth";
import { MEDICAL_FLAGS } from "@/lib/strings";

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
