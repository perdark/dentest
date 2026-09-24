"use client";

import { useRouter } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { THEME_COOKIE } from "@/lib/theme";

/**
 * Switches light ↔ dark. The class flips at once so the click answers
 * immediately; the refresh then re-renders the root layout from the new cookie,
 * which is what keeps the toasts (themed from the server) in step.
 */
export function ThemeToggle() {
  const router = useRouter();

  function toggle() {
    const dark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", dark);
    document.cookie = `${THEME_COOKIE}=${dark ? "dark" : "light"}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-11"
      onClick={toggle}
      aria-label="الوضع الليلي"
      title="الوضع الليلي / النهاري"
    >
      {/* Both icons are rendered and CSS picks one, so the server and the
          browser always agree and nothing waits for hydration. */}
      <Moon className="size-5 dark:hidden" />
      <Sun className="hidden size-5 dark:block" />
    </Button>
  );
}
