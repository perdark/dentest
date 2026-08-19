import { test, expect } from "@playwright/test";

/**
 * Runs with an empty storage state (see the "gate" project in
 * playwright.config.ts) — these assertions are meaningless with a session.
 */

test("an unauthenticated visitor cannot reach a protected screen", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: "دخول" })).toBeVisible();
});

test("a wrong PIN is rejected and creates no session", async ({ page }) => {
  // Exactly ONE wrong attempt, deliberately. lib/rate-limit.ts locks the gate
  // after 5 failures per server process; spending more here would cascade into
  // false failures in every test that follows.
  await page.goto("/login");
  await page.getByLabel("رمز الدخول").fill("0000");
  await page.getByRole("button", { name: "دخول" }).click();

  await expect(page.getByText(/رمز الدخول غير صحيح/)).toBeVisible();

  // Still no session: a protected route bounces back to the gate.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
