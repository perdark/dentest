import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module — keep it out of the bundle.
  serverExternalPackages: ["better-sqlite3"],
  // This app is developed and run at 127.0.0.1 — `npm start` binds there, so
  // that is the address in the browser and in the Electron shell. Next 16 dev
  // serves /_next/* only to hosts it recognises, and 127.0.0.1 is not the same
  // host as localhost to that check: every client chunk is refused, the page
  // renders from HTML and never hydrates. Dialogs stop opening, toasts never
  // fire, and anything client-driven looks broken while server-rendered links
  // keep working — which reads like a bug in the feature, not in the dev
  // server. Production ignores this setting entirely.
  allowedDevOrigins: ["127.0.0.1"],
  // Emit .next/standalone: a self-contained server the Electron wrapper can
  // launch with a plain Node runtime, with no node_modules install on the
  // clinic laptop. [packaging]
  output: "standalone",
  // Without this, Next walks up to ~/Desktop looking for a workspace root and
  // mirrors that whole path inside standalone/. Pin it to this project.
  outputFileTracingRoot: path.join(__dirname),
  // The source recordings and briefs are how the app was specified — they are
  // not part of what the clinic runs, and they are ~35 MB.
  outputFileTracingExcludes: {
    "*": [
      "./*.MOV",
      "./*.m4a",
      "./*.jpg",
      "./transcripts/**",
      "./transcripts_v2/**",
      "./frames/**",
      "./docs/**",
      "./tests/**",
      "./backups/**",
      "./*.db",
    ],
  },
};

export default nextConfig;
