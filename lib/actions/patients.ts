"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  createPatient as createPatientMutation,
  updatePatient as updatePatientMutation,
} from "@/lib/mutations";
import { requireAuth } from "@/lib/auth";

export type PatientFormState = { error?: string; ok?: boolean };

const patientSchema = z.object({
  fullName: z.string().trim().min(1, "اسم المريض مطلوب"),
  phone: z.string().trim().optional().default(""),
  address: z.string().trim().optional().default(""),
  notes: z.string().trim().optional().default(""),
});

const updatePatientSchema = patientSchema.extend({
  id: z.coerce.number().int().positive(),
});

/** إضافة مريض جديد (useActionState). */
export async function createPatientAction(
  _prev: PatientFormState,
  formData: FormData,
): Promise<PatientFormState> {
  await requireAuth();
  const parsed = patientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "تحقّق من البيانات المُدخلة" };
  }
  const { fullName, phone, address, notes } = parsed.data;
  createPatientMutation({
    fullName,
    phone: phone || null,
    address: address || null,
    notes: notes || null,
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
  const parsed = updatePatientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "تحقّق من البيانات المُدخلة" };
  }
  const { id, fullName, phone, address, notes } = parsed.data;
  updatePatientMutation(id, {
    fullName,
    phone: phone || null,
    address: address || null,
    notes: notes || null,
  });
  revalidatePath("/patients");
  revalidatePath(`/patients/${id}`);
  return { ok: true };
}
