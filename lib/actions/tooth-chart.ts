"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { setCaseTeeth, toothMarkFailureMessage, type ToothMarkInput } from "@/lib/mutations";
import { isValidToothCode } from "@/lib/db/teeth";

export type ToothChartState = { ok?: boolean; error?: string };

const surface = z.enum(["mesial", "distal", "facial", "oral", "occlusal"]);

const markSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("tooth"),
    toothCode: z.number().int().refine(isValidToothCode, "رقم السن غير صحيح"),
    surfaces: z.array(surface).min(1).nullable().optional(),
    note: z.string().max(400).nullable().optional(),
  }),
  z.object({
    scope: z.literal("arch"),
    arch: z.enum(["upper", "lower"]),
    note: z.string().max(400).nullable().optional(),
  }),
  z.object({
    scope: z.literal("mouth"),
    note: z.string().max(400).nullable().optional(),
  }),
]);

const saveSchema = z.object({
  caseId: z.number().int().positive(),
  // An empty chart is valid and means "no tooth recorded". «تقويم» and «تنظيف»
  // genuinely have no tooth, and requiring one would make the clerk invent it.
  marks: z.array(markSchema).max(64),
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

  const marks: ToothMarkInput[] = parsed.data.marks.map((m) =>
    m.scope === "tooth"
      ? {
          scope: "tooth",
          toothCode: m.toothCode,
          surfaces: m.surfaces ?? undefined,
          note: m.note ?? undefined,
        }
      : m.scope === "arch"
        ? { scope: "arch", arch: m.arch, note: m.note ?? undefined }
        : { scope: "mouth", note: m.note ?? undefined },
  );

  const result = setCaseTeeth(parsed.data.caseId, marks);
  if (!result.ok) return { ok: false, error: toothMarkFailureMessage(result.reason) };

  revalidatePath(`/cases/${parsed.data.caseId}/teeth`);
  revalidatePath("/patients");
  return { ok: true };
}
