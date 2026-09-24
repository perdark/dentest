import { z } from "zod";
import { isValidToothCode } from "@/lib/db/teeth";
import type { ToothMarkInput } from "@/lib/mutations";

/**
 * The wire shape of a tooth chart, shared by every action that accepts one:
 * «مخطط الأسنان» saving a case's chart, and «إضافة علاج» on the patient file,
 * which opens a case and charts it in the same save.
 */
const surface = z.enum(["mesial", "distal", "facial", "oral", "occlusal"]);

export const toothMarkSchema = z.discriminatedUnion("scope", [
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

// An empty chart is valid and means "no tooth recorded". «تقويم» and «تنظيف»
// genuinely have no tooth, and requiring one would make the clerk invent it.
export const toothMarksSchema = z.array(toothMarkSchema).max(64);

export function toToothMarkInputs(marks: z.infer<typeof toothMarksSchema>): ToothMarkInput[] {
  return marks.map((m) =>
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
}
