"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  assistantFailureMessage,
  createAssistant,
  deleteAssistant,
  setAssistantEnd,
  updateAssistant,
} from "@/lib/mutations";
import { parseAmount } from "@/lib/format";
import { isRecordableDate, isValidISODate } from "@/lib/dates";
import { requireAuth } from "@/lib/auth";

export type AssistantState = { ok?: boolean; error?: string };

/** An assistant's pay changes a doctor's share wherever it is shown. */
function revalidateAssistants() {
  revalidatePath("/assistants");
  revalidatePath("/settlement");
  revalidatePath("/doctors", "layout");
  revalidatePath("/dashboard");
}

// Arabic-Indic digits are accepted, as in a doctor's own % (lib/actions/doctors.ts).
const westernDigits = (v: string) =>
  v.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));

const assistantSchema = z.object({
  name: z.string().trim().min(1, "اكتب اسم المساعد").max(120),
  doctorId: z.coerce.number().int().positive("اختر الطبيب"),
  payMode: z.enum(["salary", "percent"], { error: "اختر طريقة الأجر" }),
  salary: z.string().optional().default(""),
  pct: z.string().optional().default(""),
  startDate: z.string().trim(),
  notes: z.string().trim().max(500).optional().default(""),
});

type Parsed =
  | { ok: true; input: Parameters<typeof createAssistant>[0] }
  | { ok: false; error: string };

/**
 * Both pay modes are read from the form; only the chosen one is kept. The
 * amount is parsed here (`parseAmount`), never taken from a browser total.
 */
function parseAssistant(formData: FormData): Parsed {
  const parsed = assistantSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "تحقّق من البيانات المُدخلة" };
  }
  const d = parsed.data;
  // A start date is when he began — it may be in the past (he already worked
  // last month), never after today.
  if (!isRecordableDate(d.startDate)) {
    return { ok: false, error: "تاريخ البدء غير صحيح — لا يمكن أن يكون بعد اليوم." };
  }
  const pctText = westernDigits(d.pct.trim());
  const pct = /^\d{1,3}$/.test(pctText) ? Number(pctText) : NaN;
  return {
    ok: true,
    input: {
      name: d.name,
      doctorId: d.doctorId,
      payMode: d.payMode,
      salary: d.payMode === "salary" ? parseAmount(d.salary) : 0,
      pct: d.payMode === "percent" ? pct : 0,
      startDate: d.startDate,
      notes: d.notes || null,
    },
  };
}

export async function addAssistant(
  _prev: AssistantState,
  formData: FormData,
): Promise<AssistantState> {
  await requireAuth();
  const p = parseAssistant(formData);
  if (!p.ok) return { error: p.error };
  const result = createAssistant(p.input);
  if (!result.ok) return { error: assistantFailureMessage(result.reason) };
  revalidateAssistants();
  return { ok: true };
}

export async function editAssistant(
  _prev: AssistantState,
  formData: FormData,
): Promise<AssistantState> {
  await requireAuth();
  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  if (!id.success) return { error: assistantFailureMessage("not_found") };
  const p = parseAssistant(formData);
  if (!p.ok) return { error: p.error };
  const result = updateAssistant(id.data, p.input);
  if (!result.ok) return { error: assistantFailureMessage(result.reason) };
  revalidateAssistants();
  return { ok: true };
}

const endSchema = z.object({
  id: z.coerce.number().int().positive(),
  // Blank = resume (clear the stop date).
  endDate: z.string().trim().optional().default(""),
});

/** «إيقاف» on a date / «إعادة» with a blank date. */
export async function setAssistantEndAction(
  _prev: AssistantState,
  formData: FormData,
): Promise<AssistantState> {
  await requireAuth();
  const parsed = endSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: assistantFailureMessage("not_found") };
  const { id, endDate } = parsed.data;
  if (endDate !== "" && !isValidISODate(endDate)) {
    return { error: assistantFailureMessage("invalid_date") };
  }
  const result = setAssistantEnd(id, endDate === "" ? null : endDate);
  if (!result.ok) return { error: assistantFailureMessage(result.reason) };
  revalidateAssistants();
  return { ok: true };
}

export async function deleteAssistantAction(
  _prev: AssistantState,
  formData: FormData,
): Promise<AssistantState> {
  await requireAuth();
  const id = z.coerce.number().int().positive().safeParse(formData.get("id"));
  if (!id.success) return { error: assistantFailureMessage("not_found") };
  const result = deleteAssistant(id.data);
  if (!result.ok) return { error: assistantFailureMessage(result.reason) };
  revalidateAssistants();
  return { ok: true };
}
