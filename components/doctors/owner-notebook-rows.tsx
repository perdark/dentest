import { formatIQD } from "@/lib/format";
import { OWNER_KINDS, OWNER_KIND_LABELS, type OwnerKind } from "@/lib/owner-notebook";

/**
 * The owner's month in his notebook's kinds, one row each, then the total.
 * Shared by «الأطباء» and his own page so both read the same way. [2026-11-15]
 */
export function OwnerNotebookRows({ totals }: { totals: Record<OwnerKind, number> }) {
  const sum = OWNER_KINDS.reduce((s, k) => s + totals[k], 0);
  return (
    <dl data-owner-notebook className="grid gap-1.5 text-sm">
      {OWNER_KINDS.map((k) => (
        <div key={k} className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">{OWNER_KIND_LABELS[k]}</dt>
          <dd className="money font-semibold">{formatIQD(totals[k])}</dd>
        </div>
      ))}
      <div className="mt-1 flex items-center justify-between gap-2 border-t pt-1.5 text-base">
        <dt className="font-semibold">مجموع المُحصَّل</dt>
        <dd className="money font-bold">{formatIQD(sum)}</dd>
      </div>
    </dl>
  );
}
