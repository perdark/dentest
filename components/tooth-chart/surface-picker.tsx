"use client";

import { getTooth, surfaceNameAr, type Surface } from "@/lib/db/teeth";
import { cn } from "@/lib/utils";

/**
 * The five faces of one tooth, drawn as the box every dental chart uses:
 * four trapezoids around a centre square.
 *
 * A filling is recorded on a FACE, not on a tooth — «حشوة ضرس» in the current
 * notes does not say which face, so a second filling on the same tooth months
 * later is indistinguishable from a redo of the first. This picker is what
 * makes that distinction storable.
 *
 * The box is drawn from the patient's own point of view, matching the arch
 * above it: for an upper-right tooth the midline is to the viewer's right, so
 * «ميزيل» (toward the midline) is the right-hand trapezoid. Mesial and distal
 * therefore swap sides between quadrants — that is correct, not a bug.
 */

const BOX = 132;
const INSET = 34;

export function SurfacePicker({
  toothCode,
  value,
  onToggle,
  className,
}: {
  toothCode: number;
  value: Surface[] | null;
  /**
   * Toggle ONE face. Deliberately not `onChange(nextArray)`: computing the next
   * array here would read `value` from a closure, so two clicks landing in the
   * same render would both start from the old set and the second would discard
   * the first. Picking «ميزيل» then «انسايزل» quickly would store only «اوكلوزل».
   * The parent applies the toggle inside a functional update instead.
   */
  onToggle: (surface: Surface) => void;
  className?: string;
}) {
  const tooth = getTooth(toothCode);
  if (!tooth) return null;

  const active = new Set(value ?? []);
  const toggle = (s: Surface) => onToggle(s);

  // Which trapezoid is mesial depends on the side the tooth sits on.
  const mesialOnRight = tooth.side === "right";
  const leftSurface: Surface = mesialOnRight ? "distal" : "mesial";
  const rightSurface: Surface = mesialOnRight ? "mesial" : "distal";
  // The outer face points away from the midline of the head: up for the upper
  // arch as drawn here, down for the lower, matching the chart above.
  const topSurface: Surface = tooth.arch === "upper" ? "facial" : "oral";
  const bottomSurface: Surface = tooth.arch === "upper" ? "oral" : "facial";

  const seg = (
    s: Surface,
    points: string,
    labelX: number,
    labelY: number,
  ) => {
    const on = active.has(s);
    return (
      <g
        key={s}
        role="checkbox"
        aria-checked={on}
        aria-label={surfaceNameAr(s, tooth)}
        tabIndex={0}
        className="cursor-pointer outline-none"
        onClick={() => toggle(s)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle(s);
          }
        }}
      >
        <polygon
          points={points}
          className={cn(
            "transition-colors",
            on ? "fill-primary stroke-primary" : "fill-background stroke-border hover:fill-accent",
          )}
          strokeWidth={1.5}
        />
        <text
          x={labelX}
          y={labelY}
          textAnchor="middle"
          dominantBaseline="middle"
          className={cn(
            "pointer-events-none text-[11px]",
            on ? "fill-primary-foreground" : "fill-muted-foreground",
          )}
        >
          {surfaceNameAr(s, tooth)}
        </text>
      </g>
    );
  };

  const a = 0;
  const b = BOX;
  const i1 = INSET;
  const i2 = BOX - INSET;

  return (
    <div dir="ltr" className={cn("flex justify-center", className)}>
      <svg viewBox={`-1 -1 ${BOX + 2} ${BOX + 2}`} className="h-36 w-36" role="group">
        {seg(topSurface, `${a},${a} ${b},${a} ${i2},${i1} ${i1},${i1}`, BOX / 2, i1 / 2 + 2)}
        {seg(bottomSurface, `${a},${b} ${i1},${i2} ${i2},${i2} ${b},${b}`, BOX / 2, BOX - i1 / 2 - 2)}
        {seg(leftSurface, `${a},${a} ${i1},${i1} ${i1},${i2} ${a},${b}`, i1 / 2 + 2, BOX / 2)}
        {seg(rightSurface, `${b},${a} ${b},${b} ${i2},${i2} ${i2},${i1}`, BOX - i1 / 2 - 2, BOX / 2)}
        {seg("occlusal", `${i1},${i1} ${i2},${i1} ${i2},${i2} ${i1},${i2}`, BOX / 2, BOX / 2)}
      </svg>
    </div>
  );
}
