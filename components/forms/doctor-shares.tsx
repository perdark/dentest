"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/forms/native-select";
import { MoneySummary } from "@/components/forms/money-summary";
import { parseAmount } from "@/lib/format";

/**
 * «+ طبيب آخر» — one treatment shared by several doctors. [2026-10-25]
 *
 * Each row is one doctor's share: their part of the price and their part of
 * what is paid now. The secretary decides the split; nothing is divided for
 * her. On save every row becomes an ordinary case of that doctor's own
 * (`createSharedCases`), so the settlement credits each doctor only with the
 * money on their row. The totals shown here are display only — the server
 * parses every row again (`parseCaseShares`).
 */
export type ShareRow = { key: number; doctorId: string; price: string; paid: string };

type DoctorOpt = { id: number; name: string };

let nextKey = 1;
export function newShareRow(doctorId: string, price = "", paid = "0"): ShareRow {
  return { key: nextKey++, doctorId, price, paid };
}

/** The first doctor not yet on a row — a new row never starts as a duplicate. */
export function unusedDoctorId(doctors: DoctorOpt[], rows: { doctorId: string }[]): string {
  const taken = new Set(rows.map((r) => r.doctorId));
  return String(doctors.find((d) => !taken.has(String(d.id)))?.id ?? "");
}

export function AddDoctorButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 gap-1.5"
      onClick={onClick}
      disabled={disabled}
    >
      <Plus className="size-4" />
      طبيب آخر
    </Button>
  );
}

export function DoctorSharesEditor({
  idPrefix,
  doctors,
  rows,
  onChange,
  onCollapse,
}: {
  idPrefix: string;
  doctors: DoctorOpt[];
  rows: ShareRow[];
  onChange: (rows: ShareRow[]) => void;
  /** Called when a removal leaves a single doctor: the form goes back to one. */
  onCollapse: (last: ShareRow) => void;
}) {
  function update(key: number, patch: Partial<ShareRow>) {
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function remove(key: number) {
    const left = rows.filter((r) => r.key !== key);
    if (left.length === 1) onCollapse(left[0]);
    else onChange(left);
  }

  const totalPrice = rows.reduce((sum, r) => sum + parseAmount(r.price), 0);
  const totalPaid = rows.reduce((sum, r) => sum + parseAmount(r.paid), 0);
  const anyPrice = rows.some((r) => r.price.trim());

  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-sm font-medium">الأطباء وحصة كل منهم</legend>
      {rows.map((row, i) => {
        const id = `${idPrefix}-share-${i}`;
        return (
          <div key={row.key} className="space-y-3 rounded-lg p-3 ring-1 ring-foreground/10">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor={`${id}-doctor`}>الطبيب {i + 1}</Label>
                <NativeSelect
                  id={`${id}-doctor`}
                  name="shareDoctorId"
                  required
                  value={row.doctorId}
                  onChange={(e) => update(row.key, { doctorId: e.target.value })}
                >
                  {doctors.map((d) => (
                    <option
                      key={d.id}
                      value={d.id}
                      disabled={rows.some((r) => r.key !== row.key && r.doctorId === String(d.id))}
                    >
                      {d.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className="size-11 shrink-0"
                aria-label={`إزالة الطبيب ${i + 1}`}
                onClick={() => remove(row.key)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor={`${id}-price`}>حصته من السعر</Label>
                <Input
                  id={`${id}-price`}
                  name="sharePrice"
                  inputMode="numeric"
                  required
                  className="h-11 text-base tabular-nums"
                  placeholder="0"
                  value={row.price}
                  onChange={(e) => update(row.key, { price: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${id}-paid`}>المدفوع له الآن</Label>
                <Input
                  id={`${id}-paid`}
                  name="sharePaid"
                  inputMode="numeric"
                  className="h-11 text-base tabular-nums"
                  value={row.paid}
                  onChange={(e) => update(row.key, { paid: e.target.value })}
                />
              </div>
            </div>
          </div>
        );
      })}

      <AddDoctorButton
        disabled={rows.length >= doctors.length}
        onClick={() => onChange([...rows, newShareRow(unusedDoctorId(doctors, rows))])}
      />

      {anyPrice ? (
        <MoneySummary
          figures={[
            { label: "مجموع السعر", amount: totalPrice },
            { label: "مجموع المدفوع", amount: totalPaid },
            { label: "المتبقي", amount: totalPrice - totalPaid, emphasis: true },
          ]}
        />
      ) : null}
    </fieldset>
  );
}
