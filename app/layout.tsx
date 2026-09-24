import type { Metadata } from "next";
import "./globals.css";
import { cookies } from "next/headers";
import { Providers } from "@/components/providers";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

// Cairo is self-hosted in app/globals.css from /public/fonts — NOT next/font/
// google, which fetches from Google at build time and would break a rebuild on
// the clinic's offline laptop. There is deliberately no <link rel="preload">:
// the app is served from the same laptop it runs on, so there is no latency to
// hide and the preload only produced an "unused preload" console warning. [E3]

export const metadata: Metadata = {
  title: "زُهى — نظام العيادة",
  description: "نظام سجلات وحسابات عيادة الأسنان",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang="ar"
      dir="rtl"
      className={theme === "dark" ? "dark h-full antialiased" : "h-full antialiased"}
      style={{ colorScheme: theme }}
      // ThemeToggle flips the class before the refresh re-renders it.
      suppressHydrationWarning
    >
      <body className="bg-background text-foreground min-h-full">
        <Providers theme={theme}>{children}</Providers>
      </body>
    </html>
  );
}
