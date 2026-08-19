import { HeartPulse } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { medicalFlagsLine } from "@/lib/strings";

/**
 * شريط الحالة الصحية — يظهر بجانب اسم المريض أينما ظهر.
 *
 * Amber, never red: this is a "read this before you start" note, not an error
 * or a debt, and the destructive colour in this app already means money owed.
 * It renders nothing at all when the patient has no recorded condition, so a
 * caller can drop it beside any name without a guard of its own.
 */
export function MedicalBadge({
  flags,
  className,
}: {
  /** عمود medical_flags كما هو مخزَّن (JSON). */
  flags: string | null | undefined;
  className?: string;
}) {
  const line = medicalFlagsLine(flags);
  if (!line) return null;

  return (
    <Badge
      variant="outline"
      className={cn(
        "h-auto max-w-full border-amber-500/40 bg-amber-50 py-0.5 leading-5 whitespace-normal text-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
        className,
      )}
      title={`حالة صحية: ${line}`}
    >
      <HeartPulse className="shrink-0 text-amber-600" />
      {line}
    </Badge>
  );
}
