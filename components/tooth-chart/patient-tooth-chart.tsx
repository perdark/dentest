"use client";

import { useMemo, useState } from "react";
import { getTooth } from "@/lib/db/teeth";
import { Odontogram, type ToothTone } from "./odontogram";
import { cn } from "@/lib/utils";

/**
 * The patient's mouth as one picture — every tooth ever treated, on one chart.
 *
 * The per-case chart answers "what are we doing today". This answers the
 * question the clinic could never ask before: "what has this mouth already
 * been through". It stores nothing: it is `case_teeth` read across all of the
 * patient's cases, so it can never disagree with the cases themselves.
 */

export interface ToothEventView {
  toothCode: number;
  treatmentKey: string;
  treatmentAr: string;
  openedDate: string;
  doctorName: string;
  caseId: number;
  caseStatus: string;
}

/**
 * Treatment → the colour a tooth carries.
 *
 * A tooth can hold several treatments over the years, and only one can be
 * drawn. The order below is "what matters most to the next doctor who looks",
 * not the newest: an implant outranks the extraction that preceded it, and an
 * extraction outranks any filling the tooth had while it was still there.
 */
const TONE_BY_KEY: Record<string, ToothTone> = {
  implant: "implant",
  extraction_surgical: "extraction",
  extraction_normal: "extraction",
  filling: "restoration",
  bridge: "restoration",
  ortho: "ortho",
};

const TONE_RANK: Record<ToothTone, number> = {
  implant: 0,
  extraction: 1,
  restoration: 2,
  ortho: 3,
  other: 4,
};

const LEGEND: { tone: ToothTone; label: string; dot: string }[] = [
  { tone: "implant", label: "زراعة", dot: "bg-sky-500" },
  { tone: "restoration", label: "حشوة أو جسر", dot: "bg-amber-400" },
  { tone: "extraction", label: "مقلوع", dot: "bg-muted-foreground/40" },
  { tone: "ortho", label: "تقويم", dot: "bg-violet-400" },
  { tone: "other", label: "علاج آخر", dot: "bg-muted-foreground/25" },
];

function toneOf(key: string): ToothTone {
  return TONE_BY_KEY[key] ?? "other";
}

export function PatientToothChart({
  events,
  emptyNote,
}: {
  events: ToothEventView[];
  emptyNote?: string;
}) {
  const [openTooth, setOpenTooth] = useState<number | null>(null);

  const byTooth = useMemo(() => {
    const m = new Map<number, ToothEventView[]>();
    for (const e of events) {
      const list = m.get(e.toothCode);
      if (list) list.push(e);
      else m.set(e.toothCode, [e]);
    }
    return m;
  }, [events]);

  const tones = useMemo(() => {
    const m = new Map<number, ToothTone>();
    for (const [code, list] of byTooth) {
      let best: ToothTone = "other";
      for (const e of list) {
        const t = toneOf(e.treatmentKey);
        if (TONE_RANK[t] < TONE_RANK[best]) best = t;
      }
      m.set(code, best);
    }
    return m;
  }, [byTooth]);

  const used = useMemo(
    () => new Set(Array.from(tones.values())),
    [tones],
  );

  if (events.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        {emptyNote ?? "لم يُسجَّل أي سن لهذا المريض بعد."}
      </p>
    );
  }

  const selected = openTooth ? byTooth.get(openTooth) : undefined;
  const tooth = openTooth ? getTooth(openTooth) : undefined;

  return (
    <div className="space-y-3">
      <Odontogram
        selected={new Map()}
        tones={tones}
        activeTooth={openTooth}
        onToggleTooth={(code) =>
          setOpenTooth((cur) => (cur === code ? null : byTooth.has(code) ? code : null))
        }
      />

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
        {LEGEND.filter((l) => used.has(l.tone)).map((l) => (
          <span key={l.tone} className="text-muted-foreground flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-full", l.dot)} />
            {l.label}
          </span>
        ))}
      </div>

      {/* A tapped tooth tells its own story, newest first. Nothing here is
          editable: the case screen owns the marks, this only reads them. */}
      {selected && tooth ? (
        <div className="bg-muted/40 rounded-xl p-3">
          <p className="mb-2 text-sm font-semibold">
            {tooth.nameAr} <span className="money text-muted-foreground">({tooth.code})</span>
          </p>
          <ul className="space-y-1 text-sm">
            {selected.map((e, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-2">
                <span className="font-medium">{e.treatmentAr}</span>
                <span className="text-muted-foreground">· {e.doctorName}</span>
                <span className="text-muted-foreground money">· {e.openedDate}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-muted-foreground text-center text-xs">
          اضغط على سن لعرض تاريخه.
        </p>
      )}
    </div>
  );
}
