/**
 * Bundle electron-updater into one file for the main process.
 *
 * The package config excludes node_modules from the Electron payload (the Next
 * server carries its own dependencies under build/app), so the updater and its
 * ~15 transitive packages are flattened into electron/vendor/updater.js here.
 * `electron` itself is provided by the runtime and stays external. [packaging]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: [path.join(root, "node_modules", "electron-updater", "out", "main.js")],
  outfile: path.join(root, "electron", "vendor", "updater.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["electron"],
  minify: true,
  legalComments: "none",
  logLevel: "warning",
});

console.log("→ bundled electron-updater into electron/vendor/updater.js");
