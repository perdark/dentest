"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delay={200}>
      {children}
      {/* Top-centre, not a corner: on the clinic's 15" screen a corner toast
          sits outside the arc anyone looks at while typing, and the whole point
          is that the confirmation gets seen. 3.5s is long enough to read an
          Arabic sentence without becoming furniture. */}
      <Toaster
        richColors
        position="top-center"
        dir="rtl"
        duration={3500}
        closeButton
        expand
      />
    </TooltipProvider>
  );
}
