import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

// Cairo is self-hosted in app/globals.css from /public/fonts — NOT next/font/
// google, which fetches from Google at build time and would break a rebuild on
// the clinic's offline laptop. There is deliberately no <link rel="preload">:
// the app is served from the same laptop it runs on, so there is no latency to
// hide and the preload only produced an "unused preload" console warning. [E3]

export const metadata: Metadata = {
  title: "زُهى — نظام العيادة",
  description: "نظام سجلات وحسابات عيادة الأسنان",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className="h-full antialiased">
      <body className="bg-background text-foreground min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
