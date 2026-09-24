/**
 * Light / dark mode, remembered in a cookie — not localStorage.
 *
 * The clinic runs Zuha inside Electron, which serves it on a random port every
 * launch. localStorage is per origin, port included, so a theme kept there is
 * forgotten on each start (the same reason tour state moved to the database —
 * see `lib/tour-state.ts`). Cookies ignore the port, so this one survives. The
 * root layout reads it on the server and renders the `dark` class directly,
 * so the page never flashes light before switching.
 */
export const THEME_COOKIE = "zuha-theme";
export type Theme = "light" | "dark";

export function parseTheme(value: string | undefined): Theme {
  return value === "dark" ? "dark" : "light";
}
