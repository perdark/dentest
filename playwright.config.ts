import { defineConfig, devices } from "@playwright/test";

/**
 * Browser-level tests for Zuha.
 *
 * These cover the layer the existing suites cannot reach: real forms, real
 * server actions, the PIN gate, and RTL rendering. The money logic itself is
 * verified far more cheaply by `npm test` and `npm run verify` — do not
 * re-test arithmetic here.
 *
 * Isolation: the server under test runs with ZUHA_DB=./e2e.db, so nothing here
 * can touch zuha.db (or the legacy dentest.db — `adoptLegacyDatabase()`
 * deliberately bails out whenever ZUHA_DB is set). ZUHA_BACKUPS_DIR is
 * redirected too, so a backup test cannot write into the clinic's backups/.
 */

const PORT = 3100; // not 3000 — a dev server can stay up while these run
const BASE_URL = `http://127.0.0.1:${PORT}`;

/** Session cookie captured once by e2e/auth.setup.ts. Path is cwd-relative. */
export const STORAGE_STATE = "e2e/.auth/state.json";

export default defineConfig({
  testDir: "./e2e",

  // One worker, no parallelism: every test shares a single SQLite file, and the
  // laptop this runs on has 8GB. Peak cost stays one browser + one Next process.
  workers: 1,
  fullyParallel: false,

  forbidOnly: !!process.env.CI,
  retries: 0,

  // `next dev` compiles each route on first hit, so a first navigation can take
  // several seconds. Generous here, tight on individual assertions.
  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    locale: "ar-IQ",
    timezoneId: "Asia/Baghdad",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    // Logs in against the freshly seeded DB and saves the cookie.
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },

    // The login gate must be exercised with NO session at all.
    {
      name: "gate",
      testMatch: /login-gate\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: { cookies: [], origins: [] },
      },
    },

    // Everything else runs signed in.
    {
      name: "app",
      testMatch: /.*\.spec\.ts/,
      testIgnore: /login-gate\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
    },
  ],

  webServer: {
    // Resetting + migrating + seeding is part of the server command on purpose:
    // it makes the ordering unconditional rather than depending on hook order.
    // Same shape as the existing `npm run verify` script.
    command: "npm run e2e:server",
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
