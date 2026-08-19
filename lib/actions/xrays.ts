"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  findOrCreatePatient,
  recordXray,
  removeXray,
  xrayFailureMessage,
  xrayRemovalFailureMessage,
} from "@/lib/mutations";
import { parseAmount } from "@/lib/format";
import { isValidISODate, todayISO } from "@/lib/dates";
import { requireAuth } from "@/lib/auth";
import { patientById, searchPatients } from "@/lib/queries";
import { medicalFlagsMarker } from "@/lib/strings";

export type XrayFormState = { ok?: boolean; error?: string };

export type PatientOption = { id: number; label: string };

/**
 * Search existing patients for the X-ray form's picker.
 *
 * This is what stops the register from breeding duplicates. A walk-in film is
 * the most frequent entry in the app, and creating the patient from a typed
 * name every time would give the same person a new record — and a new, split
 * balance — on every visit. Searching runs on the server: the clinic has
 * hundreds of patients and the list is not shipped to the browser. [D3]
 *
 * A patient with a recorded condition carries the warning into the picker
 * itself, so it is read while the patient is being chosen rather than after.
 */
export async function searchPatientsForXray(q: string): Promise<PatientOption[]> {
  await requireAuth();
  const term = typeof q === "string" ? q.slice(0, 60) : "";
  return searchPatients(term, 20).map((p) => ({
    id: p.id,
    label:
      (p.phone ? `${p.fullName} · ${p.phone}` : p.fullName) +
      medicalFlagsMarker(p.medicalFlags),
  }));
}

const recordSchema = z.object({
  // Either an existing patient is chosen, or a new one is typed. "" = new.
  patientId: z.string().optional().default(""),
  patientName: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  doctorId: z.coerce.number().int().positive("اختر الطبيب"),
  treatmentTypeId: z.coerce.number().int().positive("اختر نوع الأشعة"),
  price: z.string().optional().default(""),
  discount: z.string().optional().default(""),
  paidNow: z.string().optional().default(""),
  date: z.string().optional().default(""),
  note: z.string().optional().default(""),
});

/**
 * إضافة صورة أشعة: مريض (موجود أو جديد) + حالة أشعة + الدفعة.
 *
 * المبالغ تُحسب على الخادم؛ ما يصل من المتصفح أرقام مُدخلة لا مجاميع.
 */
export async function recordXrayAction(
  _prev: XrayFormState,
  formData: FormData,
): Promise<XrayFormState> {
  await requireAuth();
  const parsed = recordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "تحقق من البيانات المُدخلة" };
  }
  const d = parsed.data;
  const date = isValidISODate(d.date) ? d.date : todayISO();

  // An existing patient is trusted only after the id is confirmed to exist —
  // the browser sends a number, not a patient.
  let patientId: number;
  const chosenId = Number(d.patientId);
  if (Number.isInteger(chosenId) && chosenId > 0) {
    if (!patientById(chosenId)) return { error: "المريض المختار غير موجود" };
    patientId = chosenId;
  } else {
    const name = d.patientName.trim();
    if (!name) return { error: "اختر مريضاً موجوداً أو اكتب اسم مريض جديد" };
    patientId = findOrCreatePatient({ fullName: name, phone: d.phone.trim() || null });
  }

  const result = recordXray({
    patientId,
    doctorId: d.doctorId,
    treatmentTypeId: d.treatmentTypeId,
    date,
    listPrice: parseAmount(d.price),
    discount: parseAmount(d.discount),
    paidNow: parseAmount(d.paidNow),
    note: d.note.trim() || null,
  });
  if (!result.ok) return { error: xrayFailureMessage(result.reason) };

  revalidatePath("/xrays");
  revalidatePath("/daily");
  revalidatePath("/dashboard");
  revalidatePath("/debts");
  revalidatePath("/patients");
  return { ok: true };
}

const removeSchema = z.object({ caseId: z.coerce.number().int().positive() });

/** حذف صورة أشعة مُسجّلة بالخطأ (بلا دفعات — الدفعة تُلغى من الدفتر اليومي). */
export async function removeXrayAction(
  _prev: XrayFormState,
  formData: FormData,
): Promise<XrayFormState> {
  await requireAuth();
  const parsed = removeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "تعذّر تحديد الأشعة المطلوب حذفها" };

  const result = removeXray(parsed.data.caseId);
  if (!result.ok) return { error: xrayRemovalFailureMessage(result.reason) };

  revalidatePath("/xrays");
  revalidatePath("/dashboard");
  revalidatePath("/debts");
  return { ok: true };
}
