import fs from "node:fs";
import path from "node:path";
import { test as setup, expect } from "@playwright/test";
import { STORAGE_STATE } from "../playwright.config";

/**
 * The session cookie is signed with `settings.sessionSecret`, which
 * `lib/db/seed.ts` generates fresh for every database. It therefore cannot be
 * hardcoded or reused between runs — each run logs in for real against the
 * newly seeded e2e.db and saves the resulting cookie for the other projects.
 */
const SEEDED_PIN = "1234"; // DEFAULT_PIN in lib/db/seed.ts

setup("log in with the seeded PIN", async ({ page }) => {
  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });

  await page.goto("/login");
  await page.getByLabel("رمز الدخول").fill(SEEDED_PIN);
  await page.getByRole("button", { name: "دخول" }).click();

  // loginAction redirects to /dashboard only after createSession() succeeds.
  await expect(page).toHaveURL(/\/dashboard/);

  await page.context().storageState({ path: STORAGE_STATE });
});
