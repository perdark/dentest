/**
 * Tooth reference data — FDI / ISO 3950 two-digit notation.
 *
 * STATIC reference data, not clinic data. It never changes and is never edited
 * by the clinic, so it lives in code rather than in a table: no migration, no
 * seed step, no way for a clinic laptop to end up with a half-seeded mouth.
 * `case_teeth` stores only the two-digit code as an integer.
 *
 * FDI quadrants are numbered from the PATIENT's point of view:
 *   1 = upper right   2 = upper left      (permanent)
 *   3 = lower left    4 = lower right
 *   5 = upper right   6 = upper left      (primary / deciduous)
 *   7 = lower left    8 = lower right
 * Position runs 1..8 outward from the midline (1..5 for primary).
 * So 16 = permanent upper-right first molar. 51 = primary upper-right central incisor.
 *
 * MIRRORING TRAP: a dental chart is drawn as the doctor FACES the patient, so
 * the patient's right side is on the VIEWER's left. This is true regardless of
 * page direction — it is anatomy, not layout. Do NOT let `dir="rtl"` flip the
 * arch. See docs/TOOTH-CHART-SPEC.md §6.
 */

export type Arch = "upper" | "lower";
export type Side = "right" | "left";
export type Dentition = "permanent" | "primary";

/** The five nameable faces of a tooth. Which five depends on anterior/posterior. */
export type Surface =
  | "mesial" // ميزيل — toward the midline
  | "distal" // دستل — away from the midline
  | "facial" // ليبيل on front teeth, بكل on back teeth
  | "oral" // پلاتل on upper, لنگوال on lower
  | "occlusal"; // اوكلوزل on back teeth, انسايزل on front teeth

export type ToothKind =
  | "central_incisor"
  | "lateral_incisor"
  | "canine"
  | "first_premolar"
  | "second_premolar"
  | "first_molar"
  | "second_molar"
  | "third_molar";

export interface Tooth {
  /** FDI code, e.g. 16. Stored in the DB as this integer. */
  code: number;
  quadrant: number;
  position: number;
  arch: Arch;
  side: Side;
  dentition: Dentition;
  kind: ToothKind;
  /** Front teeth (incisors + canines). Drives which surfaces exist. */
  anterior: boolean;
  nameAr: string;
  nameEn: string;
  /** What an Iraqi doctor actually says out loud. Used for search, never as a label. */
  colloquialAr: string;
  surfaces: Surface[];
}

const PERMANENT_KINDS: ToothKind[] = [
  "central_incisor",
  "lateral_incisor",
  "canine",
  "first_premolar",
  "second_premolar",
  "first_molar",
  "second_molar",
  "third_molar",
];

/** Primary teeth skip the premolars: incisors, canine, then two molars. */
const PRIMARY_KINDS: ToothKind[] = [
  "central_incisor",
  "lateral_incisor",
  "canine",
  "first_molar",
  "second_molar",
];

const NAME_AR: Record<ToothKind, string> = {
  central_incisor: "الثنية",
  lateral_incisor: "الرباعية",
  canine: "الناب",
  first_premolar: "الضاحك الأول",
  second_premolar: "الضاحك الثاني",
  first_molar: "الرحى الأولى",
  second_molar: "الرحى الثانية",
  third_molar: "ضرس العقل",
};

const NAME_EN: Record<ToothKind, string> = {
  central_incisor: "Central incisor",
  lateral_incisor: "Lateral incisor",
  canine: "Canine",
  first_premolar: "First premolar",
  second_premolar: "Second premolar",
  first_molar: "First molar",
  second_molar: "Second molar",
  third_molar: "Third molar",
};

/** Iraqi clinic speech. «سن» for a front tooth, «ضرس» for a back one. */
const COLLOQUIAL_AR: Record<ToothKind, string> = {
  central_incisor: "سن أمامي",
  lateral_incisor: "سن أمامي",
  canine: "ناب",
  first_premolar: "ضاحك",
  second_premolar: "ضاحك",
  first_molar: "ضرس",
  second_molar: "ضرس",
  third_molar: "ضرس عقل",
};

/**
 * Arabic adjectives must agree with the gender of the tooth noun:
 * «الرحى الأولى العلوية اليمنى» (f.) but «الناب العلوي الأيمن» (m.).
 * Getting this wrong is the difference between a clinic system that reads as
 * written by a person and one that reads as machine output.
 */
type Gender = "m" | "f";

const GENDER: Record<ToothKind, Gender> = {
  central_incisor: "f", // الثنية
  lateral_incisor: "f", // الرباعية
  canine: "m", // الناب
  first_premolar: "m", // الضاحك
  second_premolar: "m", // الضاحك
  first_molar: "f", // الرحى
  second_molar: "f", // الرحى
  third_molar: "m", // ضرس العقل
};

const ARCH_AR: Record<Gender, Record<Arch, string>> = {
  m: { upper: "العلوي", lower: "السفلي" },
  f: { upper: "العلوية", lower: "السفلية" },
};
const SIDE_AR: Record<Gender, Record<Side, string>> = {
  m: { right: "الأيمن", left: "الأيسر" },
  f: { right: "اليمنى", left: "اليسرى" },
};

/** Colloquial nouns (سن/ناب/ضاحك/ضرس) are all masculine and indefinite. */
const ARCH_COLLOQUIAL: Record<Arch, string> = { upper: "علوي", lower: "سفلي" };
const SIDE_COLLOQUIAL: Record<Side, string> = { right: "أيمن", left: "أيسر" };

/** Quadrant → arch/side/dentition. Index is the quadrant digit. */
const QUADRANTS: Record<number, { arch: Arch; side: Side; dentition: Dentition }> = {
  1: { arch: "upper", side: "right", dentition: "permanent" },
  2: { arch: "upper", side: "left", dentition: "permanent" },
  3: { arch: "lower", side: "left", dentition: "permanent" },
  4: { arch: "lower", side: "right", dentition: "permanent" },
  5: { arch: "upper", side: "right", dentition: "primary" },
  6: { arch: "upper", side: "left", dentition: "primary" },
  7: { arch: "lower", side: "left", dentition: "primary" },
  8: { arch: "lower", side: "right", dentition: "primary" },
};

function build(): Tooth[] {
  const out: Tooth[] = [];
  for (const q of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const { arch, side, dentition } = QUADRANTS[q];
    const kinds = dentition === "permanent" ? PERMANENT_KINDS : PRIMARY_KINDS;
    kinds.forEach((kind, i) => {
      const position = i + 1;
      const anterior = kind === "central_incisor" || kind === "lateral_incisor" || kind === "canine";
      out.push({
        code: q * 10 + position,
        quadrant: q,
        position,
        arch,
        side,
        dentition,
        kind,
        anterior,
        nameAr: `${NAME_AR[kind]} ${ARCH_AR[GENDER[kind]][arch]} ${SIDE_AR[GENDER[kind]][side]}`,
        nameEn: `${arch === "upper" ? "Upper" : "Lower"} ${side} ${NAME_EN[kind].toLowerCase()}`,
        colloquialAr: `${COLLOQUIAL_AR[kind]} ${ARCH_COLLOQUIAL[arch]} ${SIDE_COLLOQUIAL[side]}`,
        // Every tooth has mesial/distal/facial/oral. The fifth face is the
        // biting edge: a flat chewing table on back teeth, a thin edge on front.
        surfaces: ["mesial", "distal", "facial", "oral", "occlusal"],
      });
    });
  }
  return out;
}

/** 32 permanent + 20 primary = 52 entries. */
export const TEETH: Tooth[] = build();

export const TEETH_BY_CODE: ReadonlyMap<number, Tooth> = new Map(TEETH.map((t) => [t.code, t]));

// `PERMANENT_TEETH` / `PRIMARY_TEETH` pre-filtered the table by dentition. The
// odontogram builds its own arch rows from `TEETH` and nothing else asked, so
// both were removed on 2026-09-22 along with `posteriorTeeth` below.

export function getTooth(code: number): Tooth | undefined {
  return TEETH_BY_CODE.get(code);
}

export function isValidToothCode(code: number): boolean {
  return TEETH_BY_CODE.has(code);
}

/**
 * Arabic label for a surface. The correct word depends on where the tooth is:
 * the outer face is «ليبيل» at the front and «بكل» at the back; the inner face
 * is «پلاتل» on top and «لنگوال» on the bottom; the biting face is
 * «انسايزل» at the front and «اوكلوزل» at the back. A single fixed label per
 * surface would be wrong on most teeth.
 *
 * ⚠️ These are the **transliterated English terms**, not Modern Standard
 * Arabic. Owner decision 2026-08-27: an Iraqi dentist at the chair says
 * «ميزيل», never «إنسي». The MSA words (إنسي · وحشي · خدي · حنكي · إطباقي)
 * were correct anatomy but nobody in the clinic speaks them, so the chart
 * read like a textbook instead of like the room.
 *
 * ⚠️ The *anatomy* is unchanged — only the wording. Do not collapse the
 * conditionals: labial/buccal splits front/back, palatal/lingual splits
 * upper/lower. Losing that makes the label wrong on most teeth.
 */
export function surfaceNameAr(surface: Surface, tooth: Tooth): string {
  switch (surface) {
    case "mesial":
      return "ميزيل";
    case "distal":
      return "دستل";
    case "facial":
      return tooth.anterior ? "ليبيل" : "بكل";
    case "oral":
      return tooth.arch === "upper" ? "پلاتل" : "لنگوال";
    case "occlusal":
      return tooth.anterior ? "انسايزل" : "اوكلوزل";
  }
}

/** Ordered outward from the midline — the order a chart draws a quadrant in. */
export function quadrantTeeth(quadrant: number): Tooth[] {
  return TEETH.filter((t) => t.quadrant === quadrant).sort((a, b) => a.position - b.position);
}

export function archTeeth(arch: Arch, dentition: Dentition = "permanent"): Tooth[] {
  return TEETH.filter((t) => t.arch === arch && t.dentition === dentition);
}

/** «سنين من الأمام» — incisors and canines, both sides. */
export function anteriorTeeth(arch?: Arch): Tooth[] {
  return TEETH.filter(
    (t) => t.dentition === "permanent" && t.anterior && (!arch || t.arch === arch),
  );
}

// `posteriorTeeth(arch?)` was the unused half of the pair — `anteriorTeeth` is
// read by the surface picker, its complement never was. Removed 2026-09-22.
