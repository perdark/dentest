import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

// Cairo is self-hosted in app/globals.css from /public/fonts — NOT next/font/
// google, which fetches from Google at build time and would break a rebuild on
// the clinic's offline laptop. [E3]

export const metadata: Metadata = {
  title: "دِنتِست — نظام العيادة",
  description: "نظام سجلات وحسابات عيادة الأسنان",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className="h-full antialiased">
      <head>
        {/* الخط العربي يحمل كل نص في الواجهة — يُحمَّل مبكراً. */}
        <link
          rel="preload"
          href="/fonts/cairo-arabic-400.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="bg-background text-foreground min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
