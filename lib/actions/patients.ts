"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  createPatient as createPatientMutation,
  updatePatient as updatePatientMutation,
} from "@/lib/mutations";
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
  createPatientMutation({
    fullName,
    phone: phone || null,
    address: address || null,
    notes: notes || null,
    medicalFlags,
    medicalNotes: medicalNotes || null,
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
  updatePatientMutation(id, {
    fullName,
    phone: phone || null,
    address: address || null,
    notes: notes || null,
    medicalFlags,
    medicalNotes: medicalNotes || null,
  });
  revalidatePath("/patients");
  revalidatePath(`/patients/${id}`);
  return { ok: true };
}
