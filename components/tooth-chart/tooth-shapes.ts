import type { Arch, Tooth, ToothKind } from "@/lib/db/teeth";

/**
 * The drawn anatomy of a tooth.
 *
 * The chart used to draw every tooth as a rounded rectangle. A clerk reading
 * boxes has to trust the number printed underneath, because nothing on screen
 * looks like the thing in the patient's mouth. Drawing the real silhouette
 * means the shape itself says which tooth it is, and the number becomes
 * confirmation rather than the only evidence.
 *
 * CANONICAL ORIENTATION: every tooth here is generated with its MESIAL side
 * (the side facing the middle of the mouth) on the LEFT, and crown DOWN — an
 * upper-left tooth as drawn. The caller mirrors it for the patient's right
 * side and flips it for the lower arch, so all 32 teeth come from one set of
 * rules and the mouth cannot end up asymmetric by accident.
 *
 * The asymmetry matters: a real incisor has a sharp mesial corner and a
 * rounded distal one, a canine's tip sits mesial of centre, and molar roots
 * curve distally. Those three details are most of the difference between a
 * drawing that reads as a tooth and one that reads as a shield icon.
 */

/** Drawn width per kind — a molar really is wider than an incisor. */
export const KIND_WIDTH: Record<ToothKind, number> = {
  central_incisor: 34,
  lateral_incisor: 29,
  canine: 33,
  first_premolar: 33,
  second_premolar: 33,
  first_molar: 46,
  second_molar: 44,
  third_molar: 39,
};

export const TOOTH_H = 86;

interface Anatomy {
  /** Share of the height taken by the crown; the rest is root. */
  crown: number;
  /** Cervical width (at the gum line), as a share of w. */
  neck: number;
  /** How hard the crown flares out of the neck. */
  flare: number;
  /** Width of the biting edge, as a share of w. */
  edge: number;
  cusps: number;
  /** How far the cusps drop below the shoulder of the crown. */
  cuspDepth: number;
  /** Single pointed cusp (canines). */
  pointed?: boolean;
  /** How far the root apex bends toward the distal side, as a share of w. */
  rootBend: number;
}

const ANATOMY: Record<ToothKind, Anatomy> = {
  central_incisor: { crown: 0.46, neck: 0.44, flare: 0.9, edge: 0.97, cusps: 1, cuspDepth: 2, rootBend: 0.06 },
  lateral_incisor: { crown: 0.45, neck: 0.42, flare: 0.88, edge: 0.93, cusps: 1, cuspDepth: 2, rootBend: 0.1 },
  canine: { crown: 0.42, neck: 0.47, flare: 0.9, edge: 0.82, cusps: 1, cuspDepth: 11, pointed: true, rootBend: 0.08 },
  first_premolar: { crown: 0.5, neck: 0.52, flare: 1.0, edge: 0.94, cusps: 2, cuspDepth: 10, rootBend: 0.05 },
  second_premolar: { crown: 0.5, neck: 0.52, flare: 1.0, edge: 0.94, cusps: 2, cuspDepth: 9, rootBend: 0.07 },
  first_molar: { crown: 0.55, neck: 0.62, flare: 1.06, edge: 1.0, cusps: 3, cuspDepth: 12, rootBend: 0.1 },
  second_molar: { crown: 0.55, neck: 0.62, flare: 1.06, edge: 0.99, cusps: 3, cuspDepth: 11, rootBend: 0.12 },
  third_molar: { crown: 0.54, neck: 0.6, flare: 1.02, edge: 0.95, cusps: 2, cuspDepth: 10, rootBend: 0.16 },
};

/**
 * Root count as a dentist would find it: upper molars have three, lower molars
 * two, and the upper first premolar is the odd one with two.
 */
function rootCount(kind: ToothKind, arch: Arch): number {
  if (kind === "first_molar" || kind === "second_molar" || kind === "third_molar") {
    return arch === "upper" ? 3 : 2;
  }
  if (kind === "first_premolar") return arch === "upper" ? 2 : 1;
  return 1;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The biting edge, drawn mesial → distal.
 *
 * Front teeth get one long edge with a sharp mesial corner and a rounded
 * distal one. Back teeth get cusps, the mesial one riding slightly higher —
 * which is what stops a molar from looking like a scalloped brick.
 */
function edgePath(x1: number, x2: number, yTop: number, yBot: number, a: Anatomy): string {
  if (a.pointed) {
    // The cusp tip of a canine sits mesial of centre, so the mesial slope is
    // the short, steep one.
    const tip = x1 + (x2 - x1) * 0.44;
    return ` L ${r2(tip)} ${r2(yBot)} Q ${r2(tip + (x2 - tip) * 0.42)} ${r2(yBot - (yBot - yTop) * 0.2)} ${r2(x2)} ${r2(yTop)}`;
  }
  if (a.cusps === 1) {
    const round = (x2 - x1) * 0.16;
    return (
      ` L ${r2(x1 + round * 0.35)} ${r2(yBot)}` +
      ` L ${r2(x2 - round)} ${r2(yBot)}` +
      ` Q ${r2(x2)} ${r2(yBot)} ${r2(x2)} ${r2(yTop)}`
    );
  }
  const seg = (x2 - x1) / a.cusps;
  let d = "";
  for (let i = 0; i < a.cusps; i++) {
    const from = x1 + seg * i;
    const to = from + seg;
    // Mesial cusps sit a touch lower on the page (i.e. taller) than distal.
    const drop = (yBot - yTop) * (1 - i * 0.12);
    const valley = yTop + (yBot - yTop) * 0.12 * (i === a.cusps - 1 ? 0 : 1);
    d += ` Q ${r2((from + to) / 2)} ${r2(yTop + drop * 1.55)} ${r2(to)} ${r2(i === a.cusps - 1 ? yTop : valley)}`;
  }
  return d;
}

export interface ToothGeometry {
  /** The crown outline, drawn on top of the roots. */
  crown: string;
  /** One path per root, drawn behind the crown. */
  roots: string[];
  /** Grooves and lobe lines — surface detail, stroked not filled. */
  details: string[];
  /** The cemento-enamel junction: where enamel stops and root begins. */
  cej: string;
  neckY: number;
  width: number;
  height: number;
}

export function toothGeometry(tooth: Tooth): ToothGeometry {
  const a = ANATOMY[tooth.kind];
  const w = KIND_WIDTH[tooth.kind];
  const h = TOOTH_H;
  const cx = w / 2;

  const crownH = h * a.crown;
  const neckY = h - crownH;
  const nw = w * a.neck;
  const fw = w * a.flare;
  const ew = w * a.edge;
  const shoulderY = h - a.cuspDepth;

  // The crown is one continuous flare from a narrow neck out to the biting
  // edge. An earlier version stopped at a "widest point" in between, which put
  // a straight segment down each side and made every tooth read as a domino.
  const crown =
    `M ${r2(cx - nw / 2)} ${r2(neckY)}` +
    ` C ${r2(cx - fw / 2)} ${r2(neckY + crownH * 0.2)} ${r2(cx - ew / 2)} ${r2(neckY + crownH * 0.48)} ${r2(cx - ew / 2)} ${r2(shoulderY)}` +
    edgePath(cx - ew / 2, cx + ew / 2, shoulderY, h, a) +
    ` C ${r2(cx + ew / 2)} ${r2(neckY + crownH * 0.48)} ${r2(cx + fw / 2)} ${r2(neckY + crownH * 0.2)} ${r2(cx + nw / 2)} ${r2(neckY)} Z`;

  // ── roots ────────────────────────────────────────────────────────────────
  const count = rootCount(tooth.kind, tooth.arch);
  const apexY = 7;
  const rootH = neckY - apexY;
  const span = count === 1 ? nw * 0.94 : nw * 1.06;
  const each = span / count;
  const bend = w * a.rootBend;
  const roots: string[] = [];
  for (let i = 0; i < count; i++) {
    const l = cx - span / 2 + each * i + (count > 1 ? 0.6 : 0);
    const r = l + each - (count > 1 ? 1.2 : 0);
    const mid = (l + r) / 2;
    // Roots splay away from the tooth's own axis AND curve distally — the
    // distal hook is the single most recognisable thing about a real root.
    const apexX = mid + (count === 1 ? 0 : (mid - cx) * 0.5) + bend;
    const aw = Math.min(each * 0.3, 5);
    roots.push(
      `M ${r2(l)} ${r2(neckY)}` +
        ` C ${r2(l - 0.6)} ${r2(neckY - rootH * 0.22)} ${r2(apexX - aw * 1.35)} ${r2(apexY + rootH * 0.45)} ${r2(apexX - aw)} ${r2(apexY + 1)}` +
        ` Q ${r2(apexX)} ${r2(apexY - 2.4)} ${r2(apexX + aw)} ${r2(apexY + 1)}` +
        ` C ${r2(apexX + aw * 1.35)} ${r2(apexY + rootH * 0.45)} ${r2(r + 0.6)} ${r2(neckY - rootH * 0.22)} ${r2(r)} ${r2(neckY)} Z`,
    );
  }

  // The CEJ curves toward the biting edge on the sides and dips at the middle;
  // drawn as a shallow arc rather than the straight strap it used to be.
  const cej =
    `M ${r2(cx - nw / 2 + 1)} ${r2(neckY + 1.5)}` +
    ` Q ${r2(cx)} ${r2(neckY + (tooth.anterior ? 6 : 4.5))} ${r2(cx + nw / 2 - 1)} ${r2(neckY + 1.5)}`;

  // ── surface detail ───────────────────────────────────────────────────────
  const details: string[] = [];
  if (a.pointed) {
    const tip = cx - ew / 2 + ew * 0.44;
    details.push(`M ${r2(tip)} ${r2(h - 4)} L ${r2(cx)} ${r2(neckY + crownH * 0.34)}`);
  } else if (tooth.anterior) {
    for (const dx of [-ew * 0.2, ew * 0.2]) {
      details.push(
        `M ${r2(cx + dx)} ${r2(shoulderY - 2)} L ${r2(cx + dx * 0.72)} ${r2(neckY + crownH * 0.42)}`,
      );
    }
  } else {
    const seg = ew / a.cusps;
    for (let i = 1; i < a.cusps; i++) {
      const x = cx - ew / 2 + seg * i;
      details.push(`M ${r2(x)} ${r2(shoulderY + 1)} L ${r2(x)} ${r2(neckY + crownH * 0.32)}`);
    }
  }

  return { crown, roots, details, cej, neckY, width: w, height: h };
}
