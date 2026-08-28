"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isValidISODate } from "@/lib/dates";

/**
 * Jump the day-based screens (الدفتر اليومي، المواعيد) to a chosen date.
 *
 * This used to be a date field beside a «عرض» button inside a GET form. It
 * worked, and it still read as broken: the button sits in a row of four
 * outline buttons — السابق, عرض, التالي — so nothing marks it as belonging to
 * the field next to it. Staff picked a date from the calendar, saw the page
 * stay on today, and concluded the picker was dead. «السابق»/«التالي» worked,
 * so that is what they used, one day at a time, to reach last month.
 *
 * Choosing a date is now the whole interaction — no second step to discover.
 * `change` on a date input fires when a full date is committed (picker click,
 * or the last segment typed), never mid-entry, so this cannot navigate away
 * while someone is still typing.
 *
 * Uncontrolled with a `key`: a controlled value fights the native control,
 * which reports "" until all three segments are filled and would blank what
 * the user just typed. The key re-seeds the field from the server after each
 * navigation instead.
 */
export function DayPicker({
  basePath,
  date,
  label = "اختر التاريخ",
  searchParams,
}: {
  basePath: string;
  date: string;
  label?: string;
  searchParams?: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Input
      key={date}
      type="date"
      name="date"
      defaultValue={date}
      aria-label={label}
      aria-busy={pending}
      className={cn(
        "h-11 w-auto transition-opacity duration-200",
        pending && "opacity-60",
      )}
      onChange={(e) => {
        const next = e.target.value;
        if (!isValidISODate(next) || next === date) return;
        const query = new URLSearchParams({ date: next, ...searchParams });
        startTransition(() => router.push(`${basePath}?${query.toString()}`));
      }}
    />
  );
}
