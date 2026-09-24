"use client";

import { useEffect, useRef, useState } from "react";
import { Search, UserCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { searchPatientsAction, type PatientMatch } from "@/lib/actions/patients";

/**
 * «مريض جديد / مريض مسجّل» — who a new case belongs to.
 *
 * Typing a name always used to make a new patient (a blank phone never
 * matches), so a returning patient's second treatment opened a second file
 * under the same name and the clinic's history split in two. «مريض مسجّل» picks
 * the existing file instead and posts only its id as `patientId`; the actions
 * then skip `findOrCreatePatient` entirely. «مريض جديد» renders `children` —
 * the screen's own name/phone fields — unchanged, and stays the default so the
 * quick walk-in entry keeps working exactly as before.
 */
export function PatientPicker({
  idPrefix,
  children,
}: {
  idPrefix: string;
  /** The new-patient fields (name, phone…), shown only in «مريض جديد». */
  children: React.ReactNode;
}) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<PatientMatch | null>(null);
  // Only the answer to the latest keystroke may land: a slow early search
  // must not overwrite the list the clerk is already looking at.
  const latest = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function search(next: string) {
    setQuery(next);
    clearTimeout(timer.current);
    const term = next.trim();
    const ticket = ++latest.current;
    if (!term) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const rows = await searchPatientsAction(term);
        if (ticket === latest.current) setResults(rows);
      } finally {
        if (ticket === latest.current) setSearching(false);
      }
    }, 250);
  }

  function choose(next: "new" | "existing") {
    setMode(next);
    setPicked(null);
    search("");
    if (next === "existing") requestAnimationFrame(() => searchRef.current?.focus());
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="المريض">
        <Button
          type="button"
          variant={mode === "new" ? "default" : "outline"}
          aria-pressed={mode === "new"}
          className="h-11 gap-1.5"
          onClick={() => choose("new")}
        >
          <UserPlus className="size-4" />
          مريض جديد
        </Button>
        <Button
          type="button"
          variant={mode === "existing" ? "default" : "outline"}
          aria-pressed={mode === "existing"}
          className="h-11 gap-1.5"
          onClick={() => choose("existing")}
        >
          <UserCheck className="size-4" />
          مريض مسجّل
        </Button>
      </div>

      {/* Keyed so a mode switch mounts fresh fields: without it React reuses
          the new-patient phone input as the search box, same position and
          type, and it flips from uncontrolled to controlled. */}
      {mode === "new" ? (
        <div key="new">{children}</div>
      ) : picked ? (
        <div key="picked" className="bg-muted/50 flex items-center justify-between gap-3 rounded-lg px-3 py-2 ring-1 ring-foreground/10">
          <input type="hidden" name="patientId" value={picked.id} />
          <div className="min-w-0">
            <p className="truncate font-medium">{picked.fullName}</p>
            {picked.phone ? (
              <p dir="ltr" className="text-muted-foreground text-end text-sm tabular-nums">
                {picked.phone}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-11 shrink-0"
            onClick={() => {
              setPicked(null);
              requestAnimationFrame(() => searchRef.current?.focus());
            }}
          >
            تغيير
          </Button>
        </div>
      ) : (
        <div key="search" className="space-y-2">
          <Label htmlFor={`${idPrefix}-patient-search`}>ابحث عن المريض</Label>
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2" />
            {/* Required so the form cannot be sent with nobody picked: the
                browser stops on this field and says why, instead of the server
                answering «اسم المريض مطلوب» about a field that is not shown. */}
            <Input
              id={`${idPrefix}-patient-search`}
              ref={searchRef}
              type="search"
              inputMode="search"
              autoComplete="off"
              required
              className="h-11 ps-9"
              placeholder="الاسم أو رقم الهاتف"
              value={query}
              onChange={(e) => {
                e.currentTarget.setCustomValidity("");
                search(e.target.value);
              }}
              onInvalid={(e) => e.currentTarget.setCustomValidity("اختر المريض من نتائج البحث")}
            />
          </div>
          {query.trim() ? (
            <ul
              className="max-h-56 overflow-y-auto rounded-lg ring-1 ring-foreground/10"
              aria-live="polite"
            >
              {results.length === 0 ? (
                <li className="text-muted-foreground px-3 py-3 text-sm">
                  {searching ? "جارٍ البحث…" : "لا يوجد مريض بهذا الاسم أو الرقم."}
                </li>
              ) : (
                results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={cn(
                        "hover:bg-muted flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-start",
                        "focus-visible:bg-muted outline-none",
                      )}
                      onClick={() => setPicked(p)}
                    >
                      <span className="truncate font-medium">{p.fullName}</span>
                      {p.phone ? (
                        <span dir="ltr" className="text-muted-foreground shrink-0 text-sm tabular-nums">
                          {p.phone}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
