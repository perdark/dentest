"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  CalendarClock,
  CalendarDays,
  Users,
  IdCard,
  Smile,
  PhoneCall,
  Receipt,
  Tags,
  Calculator,
  History,
  Settings,
  Menu,
  LogOut,
  Wallet,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NAV_ITEMS } from "@/lib/strings";
import { formatIQD } from "@/lib/format";
import { logoutAction } from "@/app/(app)/actions";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  CalendarClock,
  CalendarDays,
  Users,
  IdCard,
  Smile,
  PhoneCall,
  Receipt,
  Wallet,
  Tags,
  Calculator,
  History,
  Settings,
};

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1 p-2">
      {NAV_ITEMS.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-foreground/70 hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-5 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  clinicName,
  cashOnHand,
  reserveThreshold,
  children,
}: {
  clinicName: string;
  cashOnHand: number;
  reserveThreshold: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const overReserve = cashOnHand > reserveThreshold;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="border-b p-4">
        <p className="text-lg font-bold">دِنتِست</p>
        <p className="text-muted-foreground truncate text-xs">{clinicName}</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <NavLinks onNavigate={() => setOpen(false)} />
      </div>
      <form action={logoutAction} className="border-t p-2">
        <Button type="submit" variant="ghost" className="w-full justify-start gap-3 text-sm">
          <LogOut className="size-5" />
          خروج
        </Button>
      </form>
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar (right side in RTL) */}
      <aside className="bg-card hidden w-64 shrink-0 border-l md:block">{sidebar}</aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="bg-card/80 supports-[backdrop-filter]:bg-card/60 sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-3 backdrop-blur">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="القائمة" />
              }
            >
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-0">
              <SheetTitle className="sr-only">القائمة</SheetTitle>
              {sidebar}
            </SheetContent>
          </Sheet>

          <div className="flex-1" />

          <div
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm",
              overReserve ? "border-amber-500/40 bg-amber-50 text-amber-900" : "bg-muted/40",
            )}
            title="النقد المتوفر"
          >
            {overReserve ? (
              <AlertTriangle className="size-4 text-amber-600" />
            ) : (
              <Wallet className="text-muted-foreground size-4" />
            )}
            <span className="text-muted-foreground hidden sm:inline">النقد المتوفر:</span>
            <span className="money font-semibold">{formatIQD(cashOnHand)}</span>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
