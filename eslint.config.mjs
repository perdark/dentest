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
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Packaging output: the staged server and the Electron distributables are
    // generated and contain vendored third-party JS.
    "dist/**",
  ]),
  {
    // The Electron main process is a CommonJS Node script, not app code —
    // require() is the correct module system there.
    files: ["electron/**/*.js", "scripts/**/*.mjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
