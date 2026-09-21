import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // The e2e dev server builds into its own dist dir (see ZUHA_DIST_DIR in
    // next.config.ts). Without this, `npm run lint` reports ~9,000 problems in
    // generated Turbopack chunks and a real error in real code becomes
    // invisible in the noise. [2026-08-28]
    ".next-e2e/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Packaging output: the staged server and the Electron distributables are
    // generated and contain vendored third-party JS.
    "dist/**",
    // Playwright output: the HTML report bundles minified vendor JS, which
    // alone accounts for every error `npm run lint` used to report.
    "playwright-report/**",
    "test-results/**",
  ]),
  {
    // The Electron main process is a CommonJS Node script, not app code —
    // require() is the correct module system there. The same applies to the
    // electron-builder configs: electron-builder loads a `.cjs` config with
    // require(), so that is the only module system available to them.
    files: ["electron/**/*.js", "scripts/**/*.mjs", "*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
