"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { setPrice } from "@/lib/mutations";
import { parseAmount } from "@/lib/format";
import { requireAuth } from "@/lib/auth";

const idSchema = z.coerce.number().int().positive();

export type PricesState = { ok?: boolean; error?: string; saved?: number };

/**
 * Save the price list. Iterates every `price_<treatmentTypeId>` field, parses
 * the id + amount server-side, and writes through the `setPrice` mutation
 * (which also clears the placeholder flag + logs the edit). Reports how many
 * rows were written, and refuses rather than silently skipping bad input. [D1]
 */
export async function savePrices(
  _prev: PricesState,
  formData: FormData,
): Promise<PricesState> {
  await requireAuth();

  const updates: { id: number; amount: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("price_")) continue;
    const parsedId = idSchema.safeParse(key.slice("price_".length));
    if (!parsedId.success) continue;
    const raw = typeof value === "string" ? value : "";
    const amount = parseAmount(raw);
    // Money = integer dinars, never negative.
    if (!Number.isFinite(amount) || amount < 0) {
      return { error: `سعر غير صالح: «${raw}» — أدخل رقماً موجباً` };
    }
    updates.push({ id: parsedId.data, amount });
  }

  if (updates.length === 0) return { error: "لا توجد أسعار للحفظ" };
  for (const u of updates) setPrice(u.id, u.amount);

  revalidatePath("/prices");
  revalidatePath("/daily");
  revalidatePath("/dashboard");
  return { ok: true, saved: updates.length };
}
