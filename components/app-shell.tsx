"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  CalendarClock,
  CalendarDays,
  Users,
  Stethoscope,
  IdCard,
  Smile,
  Scan,
  PhoneCall,
  Receipt,
  Calculator,
  History,
  Settings,
  Menu,
  LogOut,
  BookOpen,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NAV_ITEMS } from "@/lib/strings";
import { Tour } from "@/components/tour";
import { ThemeToggle } from "@/components/theme-toggle";
import { formatIQD } from "@/lib/format";
import { logoutAction } from "@/app/(app)/actions";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  CalendarClock,
  CalendarDays,
  Users,
  Stethoscope,
  IdCard,
  Smile,
  Scan,
  PhoneCall,
  Receipt,
  Wallet,
  Calculator,
  History,
  BookOpen,
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
              "group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all duration-200",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-foreground/70 hover:bg-muted hover:text-foreground active:scale-[0.98]",
            )}
          >
            <Icon
              className={cn(
                "size-5 shrink-0 transition-transform duration-200",
                !active && "group-hover:scale-110",
              )}
            />
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
  offerIntro,
  toursSeen,
  children,
}: {
  clinicName: string;
  cashOnHand: number;
  /** System nobody has used for real yet — the intro tour may open itself. */
  offerIntro: boolean;
  /** Pathnames whose tour is done. From the database, not localStorage. */
  toursSeen: string[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="border-b p-4">
        <p className="text-lg font-bold">زُهى</p>
        <p className="text-muted-foreground truncate text-xs">{clinicName}</p>
      </div>
      <div data-tour="nav" className="flex-1 overflow-y-auto">
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
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 md:hidden"
                  aria-label="القائمة"
                />
              }
            >
              <Menu className="size-6" />
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-0">
              <SheetTitle className="sr-only">القائمة</SheetTitle>
              {sidebar}
            </SheetContent>
          </Sheet>

          <div className="flex-1" />

          {/* Keyed on the route so a tour never survives a navigation:
              its steps describe the screen it was opened on. */}
          <ThemeToggle />

          <Tour key={pathname} offerIntro={offerIntro} toursSeen={toursSeen} />

          {/* أهم رقم في الواجهة: يُقرأ من بعيد. */}
          <div
            data-tour="cash"
            className="bg-muted/40 flex items-center gap-2 rounded-md border px-2.5 py-1"
            title="النقد المتوفر"
          >
            <Wallet className="text-muted-foreground size-5 shrink-0" />
            <span className="flex flex-col leading-tight">
              <span className="text-muted-foreground text-xs">النقد المتوفر</span>
              <span className="money text-base font-bold sm:text-lg">
                {formatIQD(cashOnHand)}
              </span>
            </span>
          </div>
        </header>

        {/* Keyed on the route so every navigation replays the entrance. Without
            it a click on the sidebar swaps the whole screen with no sign that
            anything happened, which on a slow laptop is indistinguishable from
            a click that did not register. */}
        <main key={pathname} className="animate-page flex-1 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
