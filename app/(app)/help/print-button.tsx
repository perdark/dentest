"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The clinic asked for something they can keep next to the chair. Printing the
 * guide beats writing a separate PDF: the paper can never drift out of date
 * relative to the app, because it IS the app's own text.
 */
export function PrintButton() {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 print:hidden"
      onClick={() => window.print()}
    >
      <Printer className="size-4" />
      طباعة الدليل
    </Button>
  );
}
