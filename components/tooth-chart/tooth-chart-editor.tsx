"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Odontogram, toothLabel, type ToothState } from "./odontogram";
import { SurfacePicker } from "./surface-picker";
import { anteriorTeeth, archTeeth, getTooth, type Arch, type Surface } from "@/lib/db/teeth";
import { saveCaseTeethAction } from "@/lib/actions/tooth-chart";

/**
 * «مخطط الأسنان» for one case.
 *
 * The shortcut row exists because the doctor does not always mean a tooth. The
 * clinic's own phrasing — «يشتغل الفك العلوي، أو سنين من الأمام، أو تقويم» — is
 * four different scopes, and only one of them is a tooth. «الفك العلوي» is
 * stored as ONE arch mark rather than sixteen tooth rows: expanding it would
 * throw away what was actually said. «الأمامية» is the opposite case — it is
 * shorthand for a specific set of teeth, so it does expand.
 */

type Marks = Map<number, ToothState>;

export function ToothChartEditor({
  caseId,
  initialTeeth,
  initialArches,
  initialMouth,
  history,
  treatmentAr,
}: {
  caseId: number;
  initialTeeth: Map<number, ToothState>;
  initialArches: Arch[];
  initialMouth: boolean;
  history?: Map<number, number>;
  treatmentAr?: string;
}) {
  const [marks, setMarks] = useState<Marks>(() => new Map(initialTeeth));
  const [arches, setArches] = useState<Set<Arch>>(() => new Set(initialArches));
  const [mouth, setMouth] = useState(initialMouth);
  const [active, setActive] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const toggleTooth = useCallback((code: number) => {
    setMarks((prev) => {
      const next = new Map(prev);
      if (next.has(code)) next.delete(code);
      else next.set(code, { surfaces: null, note: "" });
      return next;
    });
  }, []);

  const addTeeth = (codes: number[]) => {
    setMarks((prev) => {
      const next = new Map(prev);
      // If the whole group is already on, the button clears it — one control,
      // both directions, so the clerk never hunts for an "unselect" affordance.
      const allOn = codes.every((c) => next.has(c));
      for (const c of codes) {
        if (allOn) next.delete(c);
        else if (!next.has(c)) next.set(c, { surfaces: null, note: "" });
      }
      return next;
    });
  };

  const toggleArch = (arch: Arch) =>
    setArches((prev) => {
      const next = new Set(prev);
      if (next.has(arch)) next.delete(arch);
      else next.add(arch);
      return next;
    });

  const clearAll = () => {
    setMarks(new Map());
    setArches(new Set());
    setMouth(false);
    setActive(null);
  };

  const activeTooth = active === null ? null : getTooth(active);
  const activeState = active === null ? undefined : marks.get(active);

  // The toggle is applied against `prev`, never against a captured prop, so a
  // fast second click cannot start from a stale face set and drop the first.
  const toggleActiveSurface = (surface: Surface) => {
    if (active === null) return;
    setMarks((prev) => {
      const next = new Map(prev);
      const cur = next.get(active);
      if (!cur) return prev;
      const faces = new Set(cur.surfaces ?? []);
      if (faces.has(surface)) faces.delete(surface);
      else faces.add(surface);
      next.set(active, { ...cur, surfaces: faces.size === 0 ? null : [...faces] });
      return next;
    });
  };

  const setActiveNote = (note: string) => {
    if (active === null) return;
    setMarks((prev) => {
      const next = new Map(prev);
      const cur = next.get(active);
      if (cur) next.set(active, { ...cur, note });
      return next;
    });
  };

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (mouth) parts.push("الفم كامل");
    for (const a of arches) parts.push(a === "upper" ? "الفك العلوي" : "الفك السفلي");
    const codes = [...marks.keys()].sort((a, b) => a - b);
    if (codes.length > 0) parts.push(codes.map((c) => toothLabel(c)).join("، "));
    return parts.length > 0 ? parts.join(" · ") : "لا يوجد تحديد";
  }, [marks, arches, mouth]);

  const save = () => {
    const payload = [
      ...(mouth ? [{ scope: "mouth" as const, note: null }] : []),
      ...[...arches].map((arch) => ({ scope: "arch" as const, arch, note: null })),
      ...[...marks.entries()].map(([toothCode, s]) => ({
        scope: "tooth" as const,
        toothCode,
        surfaces: s.surfaces && s.surfaces.length > 0 ? s.surfaces : null,
        note: s.note.trim() === "" ? null : s.note.trim(),
      })),
    ];
    startTransition(async () => {
      const res = await saveCaseTeethAction({ caseId, marks: payload });
      if (res.ok) toast.success("تم حفظ مخطط الأسنان.");
      else toast.error(res.error ?? "تعذّر الحفظ.");
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>مخطط الأسنان</span>
          {treatmentAr && (
            <span className="text-muted-foreground text-sm font-normal">{treatmentAr}</span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={arches.has("upper") ? "default" : "outline"} onClick={() => toggleArch("upper")}>
            الفك العلوي
          </Button>
          <Button type="button" size="sm" variant={arches.has("lower") ? "default" : "outline"} onClick={() => toggleArch("lower")}>
            الفك السفلي
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => addTeeth(anteriorTeeth().map((t) => t.code))}>
            الأسنان الأمامية
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => addTeeth(archTeeth("upper").map((t) => t.code))}>
            أسنان الفك العلوي
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => addTeeth(archTeeth("lower").map((t) => t.code))}>
            أسنان الفك السفلي
          </Button>
          <Button type="button" size="sm" variant={mouth ? "default" : "outline"} onClick={() => setMouth((v) => !v)}>
            الفم كامل
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={clearAll}>
            مسح التحديد
          </Button>
        </div>

        <Odontogram
          selected={marks}
          arches={arches}
          history={history}
          activeTooth={active}
          onToggleTooth={toggleTooth}
          onActivateTooth={(c) => setActive(c)}
        />

        <p className="text-muted-foreground text-sm">
          <span className="text-foreground font-medium">المحدَّد: </span>
          {summary}
        </p>

        {activeTooth && activeState && (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium">
                {activeTooth.nameAr}{" "}
                <span dir="ltr" className="text-muted-foreground tabular-nums">
                  ({activeTooth.code})
                </span>
              </h3>
              <Button type="button" size="sm" variant="ghost" onClick={() => setActive(null)}>
                إغلاق
              </Button>
            </div>

            <div>
              <Label className="mb-1 block">الأسطح (للحشوة)</Label>
              <SurfacePicker
                toothCode={activeTooth.code}
                value={activeState.surfaces}
                onToggle={toggleActiveSurface}
              />
              <p className="text-muted-foreground mt-1 text-center text-xs">
                اتركها فارغة إذا كان العلاج على السن كامل.
              </p>
            </div>

            <div>
              <Label htmlFor="tooth-note" className="mb-1 block">
                ملاحظة على هذا السن
              </Label>
              <Input
                id="tooth-note"
                value={activeState.note}
                maxLength={400}
                placeholder="مثال: كسر في الحافة، يحتاج مراجعة"
                onChange={(e) => setActiveNote(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "جارٍ الحفظ…" : "حفظ المخطط"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
