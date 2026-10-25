"use strict";

/**
 * Silent updates from GitHub Releases.
 *
 * Nobody at the clinic should have to do anything for an update to land, and
 * nobody should be asked a question they cannot answer. So: when the laptop is
 * online the app checks on start and every few hours, downloads a newer release
 * in the background, and installs it silently the next time the program is
 * closed. Offline is the normal case, not an error — every failure is
 * swallowed and simply retried at the next check.
 *
 * The records are not touched by an update: they live in %APPDATA%\zuha, the
 * installer only replaces the program folder. The server takes a snapshot of
 * the database the first time a new version starts, before its migrations run
 * (`snapshotOnVersionChange` in lib/db/bootstrap.ts), so a bad release is
 * recoverable from «استعادة نسخة محفوظة».
 *
 * `electron-updater` is bundled into electron/vendor/updater.js by
 * scripts/bundle-updater.mjs, because the package config ships no
 * node_modules for the main process.
 */

const path = require("node:path");
const fs = require("node:fs");

const CHECK_EVERY_MS = 3 * 60 * 60 * 1000;
const FIRST_CHECK_AFTER_MS = 60 * 1000;

function startAutoUpdate({ app, isDemo }) {
  // Dev runs and the demo copy never update: the demo would otherwise install
  // the clinic build over itself, under a different data folder.
  if (!app.isPackaged || isDemo) return;

  const vendored = path.join(__dirname, "vendor", "updater.js");
  if (!fs.existsSync(vendored)) return;

  let autoUpdater;
  try {
    ({ autoUpdater } = require(vendored));
  } catch {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.logger = null;
  // No network, GitHub down, a half-published release: all retried later.
  autoUpdater.on("error", () => {});

  const check = () => {
    autoUpdater.checkForUpdates().catch(() => {});
  };
  setTimeout(check, FIRST_CHECK_AFTER_MS).unref();
  setInterval(check, CHECK_EVERY_MS).unref();
}

module.exports = { startAutoUpdate };
