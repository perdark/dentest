"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { setCaseTeeth, toothMarkFailureMessage } from "@/lib/mutations";
import { toothMarksSchema, toToothMarkInputs } from "@/lib/tooth-marks";

export type ToothChartState = { ok?: boolean; error?: string };

const saveSchema = z.object({
  caseId: z.number().int().positive(),
  marks: toothMarksSchema,
});

/**
 * Save the whole chart for a case. Replace-all: the screen always sends the
 * complete picture, so a de-selected tooth needs no separate delete path.
 */
export async function saveCaseTeethAction(input: {
  caseId: number;
  marks: unknown[];
}): Promise<ToothChartState> {
  await requireAuth();

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة." };
  }

  const result = setCaseTeeth(parsed.data.caseId, toToothMarkInputs(parsed.data.marks));
  if (!result.ok) return { ok: false, error: toothMarkFailureMessage(result.reason) };

  revalidatePath(`/cases/${parsed.data.caseId}/teeth`);
  revalidatePath("/patients");
  return { ok: true };
}
