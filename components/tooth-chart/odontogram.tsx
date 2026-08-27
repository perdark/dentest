"use client";

import { useMemo } from "react";
import {
  TEETH,
  getTooth,
  quadrantTeeth,
  type Arch,
  type Surface,
  type Tooth,
} from "@/lib/db/teeth";
import { KIND_WIDTH, TOOTH_H, toothGeometry, type ToothGeometry } from "./tooth-shapes";
import { cn } from "@/lib/utils";

/**
 * مخطط الأسنان — the 2D odontogram.
 *
 * ORIENTATION IS ANATOMY, NOT LAYOUT. A dental chart is drawn as the doctor
 * FACES the patient, so the patient's right side appears on the VIEWER's left:
 * quadrant 1 (upper right) is drawn top-LEFT. This is true in an Arabic clinic
 * and an English one alike.
 *
 * That is why this file uses explicit SVG x-coordinates and sets `dir="ltr"` on
 * the wrapper, and is the one place in Zuha exempt from CONVENTIONS.md rule 5
 * (logical properties only). If `dir="rtl"` were allowed to flip the arch, the
 * chart would name the wrong tooth — and the wrong tooth gets extracted. Do not
 * "fix" the hard-coded directions here.
 *
 * The teeth are drawn as real silhouettes (see tooth-shapes.ts) on a curved
 * arch rather than as a row of boxes: the clerk should recognise the mouth
 * before reading a single number.
 */

const GAP = 3;
const LABEL_H = 22;
const ROW_GAP = 34;
/** How far the front of each arch dips toward the bite line. */
const ARCH_CURVE = 34;
/** How far the back teeth tilt in toward the middle of the mouth. */
const ARCH_TILT = 12;

interface Placed {
  tooth: Tooth;
  geo: ToothGeometry;
  x: number;
  w: number;
  /** Row baseline plus this tooth's own dip along the arch curve. */
  y: number;
  /** −1 at the patient's right end of the row, +1 at the left end. */
  t: number;
}

/** Viewer-left → viewer-right order for each arch. */
function archOrder(arch: Arch): Tooth[] {
  if (arch === "upper") {
    // Q1 (patient upper-right) runs midline→back, so reverse it to sit leftmost.
    return [...quadrantTeeth(1)].reverse().concat(quadrantTeeth(2));
  }
  return [...quadrantTeeth(4)].reverse().concat(quadrantTeeth(3));
}

function layout() {
  const upper = archOrder("upper");
  const lower = archOrder("lower");
  const widthOf = (row: Tooth[]) =>
    row.reduce((sum, t) => sum + KIND_WIDTH[t.kind] + GAP, 0) - GAP;
  const total = Math.max(widthOf(upper), widthOf(lower));

  const place = (row: Tooth[], baseY: number, arch: Arch): Placed[] => {
    const rowW = widthOf(row);
    let x = (total - rowW) / 2;
    return row.map((tooth) => {
      const w = KIND_WIDTH[tooth.kind];
      const t = (x + w / 2 - total / 2) / (total / 2);
      // The arch is a curve, not a line: the front teeth sit closest to the
      // bite, the molars ride back and away from it.
      const dip = ARCH_CURVE * (1 - t * t);
      const p: Placed = {
        tooth,
        geo: toothGeometry(tooth),
        x,
        w,
        y: arch === "upper" ? baseY + dip : baseY - dip,
        t,
      };
      x += w + GAP;
      return p;
    });
  };

  const upperY = LABEL_H;
  const lowerY = upperY + TOOTH_H + ARCH_CURVE + ROW_GAP + LABEL_H;
  return {
    width: total,
    height: lowerY + TOOTH_H + ARCH_CURVE + LABEL_H,
    upper: place(upper, upperY, "upper"),
    lower: place(lower, lowerY, "lower"),
    upperY,
    lowerY,
  };
}

/**
 * A tooth is ivory in any theme.
 *
 * Everything else on this screen follows the app's light/dark tokens, but
 * enamel does not change colour because the page did — a dark-grey tooth reads
 * as a dead tooth. The two values below are the same enamel under a light and
 * a dim room light, which is as far as theming should reach into anatomy.
 */
const ENAMEL = "fill-[#fbf8f1] dark:fill-[#e9e2d4] stroke-stone-400/80 dark:stroke-stone-500/80";
const DENTINE = "fill-[#f4eee1] dark:fill-[#ded6c5] stroke-stone-400/70 dark:stroke-stone-500/70";

const GLOSS_ID = "zuha-tooth-gloss";
const SHADE_ID = "zuha-tooth-shade";

export interface ToothState {
  surfaces: Surface[] | null;
  note: string;
}

/** What a tooth carries from its history, once, for colour. */
export type ToothTone = "implant" | "extraction" | "ortho" | "restoration" | "other";

const TONE_CLASS: Record<ToothTone, { crown: string; root: string }> = {
  implant: { crown: "fill-sky-500/85 stroke-sky-700", root: "fill-sky-500/40 stroke-sky-700/50" },
  extraction: {
    crown: "fill-muted stroke-muted-foreground/40",
    root: "fill-muted stroke-muted-foreground/30",
  },
  ortho: {
    crown: "fill-violet-400/70 stroke-violet-600",
    root: "fill-violet-400/30 stroke-violet-600/50",
  },
  restoration: {
    crown: "fill-amber-400/80 stroke-amber-600",
    root: "fill-amber-400/30 stroke-amber-600/50",
  },
  other: {
    crown: "fill-muted-foreground/25 stroke-muted-foreground/60",
    root: "fill-muted-foreground/15 stroke-muted-foreground/40",
  },
};

export interface OdontogramProps {
  /** Teeth marked on the case being edited. */
  selected: Map<number, ToothState>;
  /** Teeth touched by any earlier case — drawn as history, not selection. */
  history?: Map<number, number>;
  /** Accumulated meaning per tooth, for the patient-file chart. */
  tones?: Map<number, ToothTone>;
  /** Arches marked whole («الفك العلوي»). Shades the row without selecting teeth. */
  arches?: Set<Arch>;
  activeTooth?: number | null;
  onToggleTooth?: (code: number) => void;
  onActivateTooth?: (code: number) => void;
  readOnly?: boolean;
  className?: string;
}

export function Odontogram({
  selected,
  history,
  tones,
  arches,
  activeTooth,
  onToggleTooth,
  onActivateTooth,
  readOnly = false,
  className,
}: OdontogramProps) {
  const geo = useMemo(() => layout(), []);

  const renderRow = (row: Placed[], arch: Arch) => {
    const archMarked = arches?.has(arch) ?? false;
    const baseY = arch === "upper" ? geo.upperY : geo.lowerY;
    const bandY = arch === "upper" ? baseY - 6 : baseY - ARCH_CURVE - 6;
    // Numbers sit outside the mouth: above the upper arch, below the lower one.
    const labelY = arch === "upper" ? baseY - 8 : baseY + TOOTH_H + 16;

    return (
      <g key={arch}>
        {archMarked && (
          <rect
            x={-8}
            y={bandY}
            width={geo.width + 16}
            height={TOOTH_H + ARCH_CURVE + 12}
            rx={14}
            className="fill-primary/10 stroke-primary/40"
            strokeDasharray="4 3"
          />
        )}
        {row.map((p) => {
          const { tooth, geo: shape, x, w, y, t } = p;
          const isSelected = selected.has(tooth.code);
          const past = history?.get(tooth.code) ?? 0;
          const tone = tones?.get(tooth.code);
          const isActive = activeTooth === tooth.code;
          const state = selected.get(tooth.code);
          const partial = state?.surfaces != null && state.surfaces.length > 0;
          const missing = tone === "extraction";

          // Order matters: translate to the slot, tilt the tooth along the
          // arch, then flip the lower row. The flip is what guarantees the two
          // arches are mirror images and can never drift apart.
          const tilt = t * ARCH_TILT * (arch === "upper" ? 1 : -1);
          // Shapes are generated mesial-left (see tooth-shapes.ts). The teeth
          // on the patient's right sit on the viewer's left with the midline
          // to THEIR right, so they are mirrored — which is what makes the two
          // halves of the mouth reflections of each other instead of copies.
          const transform =
            `translate(${x} ${y}) rotate(${tilt} ${w / 2} ${TOOTH_H / 2})` +
            (tooth.side === "right" ? ` translate(${w} 0) scale(-1 1)` : "") +
            (arch === "lower" ? ` translate(0 ${TOOTH_H}) scale(1 -1)` : "");

          const crownClass = isSelected
            ? "fill-primary stroke-primary"
            : tone
              ? TONE_CLASS[tone].crown
              : past > 0
                ? "fill-muted stroke-muted-foreground/50"
                : cn(ENAMEL, "group-hover:brightness-95");
          const rootClass = isSelected
            ? "fill-primary/45 stroke-primary/70"
            : tone
              ? TONE_CLASS[tone].root
              : past > 0
                ? "fill-muted/60 stroke-muted-foreground/30"
                : DENTINE;

          return (
            <g
              key={tooth.code}
              role={readOnly ? undefined : "checkbox"}
              aria-checked={isSelected}
              aria-label={tooth.nameAr}
              tabIndex={readOnly ? undefined : 0}
              className={cn("group", !readOnly && "cursor-pointer outline-none")}
              onClick={() => {
                if (readOnly) return;
                onToggleTooth?.(tooth.code);
                onActivateTooth?.(tooth.code);
              }}
              onKeyDown={(e) => {
                if (readOnly) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggleTooth?.(tooth.code);
                  onActivateTooth?.(tooth.code);
                }
              }}
            >
              <g transform={transform} className="pointer-events-none">
                <g
                  className={cn("transition-[fill,stroke]", missing && "opacity-45")}
                  strokeWidth={isActive ? 2.4 : 1.3}
                  strokeLinejoin="round"
                >
                  {shape.roots.map((d, i) => (
                    <path key={i} d={d} className={rootClass} />
                  ))}
                  <path d={shape.crown} className={crownClass} />
                  {/* Volume, without a filter: a highlight down the front of
                      the crown and a shadow along both approximal edges. Both
                      ride on top of whatever the crown is filled with, so a
                      selected or colour-coded tooth keeps its shape. */}
                  <path d={shape.crown} fill={`url(#${GLOSS_ID})`} stroke="none" />
                  <path d={shape.crown} fill={`url(#${SHADE_ID})`} stroke="none" />
                  <path
                    d={shape.cej}
                    fill="none"
                    strokeWidth={1}
                    className={cn(
                      isSelected ? "stroke-primary-foreground/35" : "stroke-stone-400/60",
                    )}
                  />
                  <g
                    fill="none"
                    strokeWidth={1}
                    strokeLinecap="round"
                    className={cn(
                      isSelected
                        ? "stroke-primary-foreground/45"
                        : "stroke-muted-foreground/35",
                    )}
                  >
                    {shape.details.map((d, i) => (
                      <path key={i} d={d} />
                    ))}
                  </g>
                </g>
                {/* A pulled tooth is struck through — the one state that must
                    read instantly, because nothing should be planned on it. */}
                {missing && !isSelected && (
                  <path
                    d={`M ${w * 0.12} ${TOOTH_H * 0.3} L ${w * 0.88} ${TOOTH_H * 0.82}`}
                    className="stroke-muted-foreground/70"
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                )}
              </g>
              {/* The click target is an upright column over this tooth's slot,
                  and it is the ONLY thing in the group that takes a pointer.
                  The drawn tooth cannot be clicked, because a tilted molar's
                  roots reach over its neighbour — and a chart that answers a
                  tap with the tooth next door is how the wrong tooth ends up
                  marked. Column geometry means a tap always resolves to the
                  tooth whose number is printed under it. */}
              <rect
                x={x - GAP / 2}
                y={y - 8}
                width={w + GAP}
                height={TOOTH_H + 16}
                fill="transparent"
              />
              {/* Badges stay upright: they are text, not anatomy, so they are
                  drawn outside the tilted/flipped group. */}
              {partial && (
                <circle
                  cx={x + w / 2}
                  cy={arch === "upper" ? y + TOOTH_H - 12 : y + 12}
                  r={3}
                  className="fill-primary-foreground"
                />
              )}
              {past > 0 && !isSelected && !tone && (
                <text
                  x={x + w / 2}
                  y={y + TOOTH_H * (arch === "upper" ? 0.82 : 0.28)}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[11px] font-medium"
                >
                  {past}
                </text>
              )}
              <text
                x={x + w / 2}
                y={labelY}
                textAnchor="middle"
                className={cn(
                  "text-[11px] tabular-nums",
                  isSelected ? "fill-foreground font-semibold" : "fill-muted-foreground",
                )}
              >
                {tooth.code}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  return (
    // dir="ltr" is load-bearing: see the file header. The arch must not mirror.
    // The chart has a natural size — a tooth is a tooth, not a billboard. It is
    // capped at its drawn width and centred; below that it scrolls inside its
    // own box so the page itself never scrolls sideways (CONVENTIONS rule 5).
    <div dir="ltr" className={cn("overflow-x-auto", className)}>
      <svg
        viewBox={`-10 0 ${geo.width + 20} ${geo.height}`}
        style={{ maxWidth: geo.width + 20 }}
        className="mx-auto block h-auto w-full min-w-[640px]"
        role="group"
        aria-label="مخطط الأسنان"
      >
        <defs>
          <linearGradient id={GLOSS_ID} x1="0.5" y1="1" x2="0.5" y2="0">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.4" />
            <stop offset="45%" stopColor="#fff" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={SHADE_ID} x1="0" y1="0.5" x2="1" y2="0.5">
            <stop offset="0%" stopColor="#3b2f1d" stopOpacity="0.22" />
            <stop offset="22%" stopColor="#3b2f1d" stopOpacity="0.02" />
            <stop offset="72%" stopColor="#3b2f1d" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#3b2f1d" stopOpacity="0.26" />
          </linearGradient>
        </defs>
        {/* Midline: the only cue that separates right from left at a glance. */}
        <line
          x1={geo.width / 2}
          y1={0}
          x2={geo.width / 2}
          y2={geo.height}
          className="stroke-border"
          strokeWidth={1}
          strokeDasharray="3 4"
        />
        {renderRow(geo.upper, "upper")}
        {renderRow(geo.lower, "lower")}
      </svg>
    </div>
  );
}

/** Labels used by the side panel and the summary line. */
export function toothLabel(code: number): string {
  return getTooth(code)?.nameAr ?? `سن ${code}`;
}

export const ALL_TOOTH_CODES = TEETH.filter((t) => t.dentition === "permanent").map(
  (t) => t.code,
);
