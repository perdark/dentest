"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { addExpense, deleteExpense } from "@/lib/mutations";
import { parseAmount } from "@/lib/format";
import { todayISO, isValidISODate } from "@/lib/dates";
import { requireAuth } from "@/lib/auth";

export type ExpenseFormState = { ok?: boolean; error?: string };

// الفئات الست المسموح بها (مطابقة لمخطط قاعدة البيانات).
const CATEGORY = z.enum([
  "food",
  "water",
  "dental_materials",
  "dental_lab",
  "installments",
  "other",
]);

const addSchema = z.object({
  date: z.string().optional().default(""),
  category: CATEGORY,
  amount: z.string().trim().min(1, "أدخل المبلغ"),
  note: z.string().optional().default(""),
});

// ── إضافة مصروف ───────────────────────────────────────────────────────────────
export async function addExpenseAction(
  _prev: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  await requireAuth();
  const parsed = addSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "تحقق من البيانات المُدخلة" };
  }
  const d = parsed.data;

  // المبلغ يُحسب على الخادم — دينار عراقي صحيح، لا أرقام عشرية.
  const amount = Math.max(0, parseAmount(d.amount));
  if (amount <= 0) {
    return { error: "أدخل مبلغاً صحيحاً أكبر من صفر" };
  }
  const date = isValidISODate(d.date) ? d.date : todayISO();

  addExpense({
    expenseDate: date,
    category: d.category,
    amount,
    note: d.note.trim() || null,
  });

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ── حذف مصروف ─────────────────────────────────────────────────────────────────
const deleteSchema = z.object({ id: z.coerce.number().int().positive() });

export async function deleteExpenseAction(formData: FormData): Promise<void> {
  await requireAuth();
  const parsed = deleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  deleteExpense(parsed.data.id);

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
}
