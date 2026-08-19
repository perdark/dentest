import { test, expect, type Page } from "@playwright/test";

/**
 * Every screen the clinic can navigate to must render signed in, in RTL,
 * without throwing. This is the cheapest test in the suite and the one most
 * likely to catch a broken import or a server-action typo after a refactor.
 *
 * Landmarks are the `data-tour` attributes already in the app — they exist for
 * the guided tour, so they are maintained UI contracts rather than selectors
 * invented for the tests. Dynamic routes (/patients/[id] etc.) are covered by
 * the flow specs, which have real ids to visit.
 */

type Screen = {
  path: string;
  landmark: string | null;
  /**
   * Set for screens whose landmark sits inside a `rows.length > 0` branch. On a
   * freshly seeded database those legitimately render their empty state
   * instead, and asserting the landmark alone would fail for a correct app.
   * Either one satisfies the check, so this does not depend on how much data an
   * earlier spec happened to create.
   */
  emptyState?: string;
};

const SCREENS: readonly Screen[] = [
  { path: "/dashboard", landmark: '[data-tour="stats"]' },
  { path: "/daily", landmark: '[data-tour="daily-ledger"]' },
  {
    path: "/patients",
    landmark: '[data-tour="patients-list"]',
    emptyState: "لا يوجد مرضى بعد",
  },
  { path: "/appointments", landmark: '[data-tour="appt-list"]' },
  { path: "/doctors", landmark: '[data-tour="doctors-list"]' },
  {
    path: "/implants",
    landmark: '[data-tour="implants-list"]',
    emptyState: "لا توجد بطاقات زراعة بعد",
  },
  { path: "/ortho", landmark: '[data-tour="ortho-list"]' },
  { path: "/xrays", landmark: '[data-tour="xrays-list"]' },
  { path: "/expenses", landmark: '[data-tour="expenses-form"]' },
  { path: "/cash", landmark: '[data-tour="cash-form"]' },
  { path: "/debts", landmark: '[data-tour="debts-list"]' },
  { path: "/settlement", landmark: '[data-tour="settlement-table"]' },
  { path: "/audit", landmark: '[data-tour="audit-filters"]' },
  { path: "/settings", landmark: '[data-tour="settings-page"]' },
  { path: "/help", landmark: null },
];

/** Uncaught exceptions and console errors, collected per page. */
function watchForErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

for (const { path, landmark, emptyState } of SCREENS) {
  test(`${path} renders in RTL without errors`, async ({ page }) => {
    const errors = watchForErrors(page);

    const res = await page.goto(path);
    expect(res?.status(), `${path} should not be a server error`).toBeLessThan(400);

    // Not redirected back to the gate — i.e. the saved session really works.
    await expect(page).toHaveURL(new RegExp(`${path}$`));

    // Arabic RTL is a phase-2 invariant, never a late patch.
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");

    await expect(page.locator("h1").first()).toBeVisible();

    if (landmark) {
      const present = emptyState
        ? page.locator(landmark).first().or(page.getByText(emptyState).first())
        : page.locator(landmark).first();
      await expect(present.first()).toBeVisible();
    }

    // Nothing in the UI may admit it is a test system (golden rule 5).
    await expect(page.locator("body")).not.toContainText("TODO");
    await expect(page.locator("body")).not.toContainText("غير مؤكد");
    await expect(page.locator("body")).not.toContainText("lorem");

    expect(errors, `${path} logged errors`).toEqual([]);
  });
}

test("the main nav reaches every screen it lists", async ({ page }) => {
  // The only test that visits every route in one body, and `next dev` compiles
  // each one on first hit (~1s each on the clinic-spec laptop). That is real
  // work, not a hang — give it the room instead of letting a cold cache read
  // as a failure.
  test.slow();

  await page.goto("/dashboard");
  const nav = page.locator('[data-tour="nav"]').first();
  await expect(nav).toBeVisible();
  // Every nav link must point at a route that exists, not a 404.
  const hrefs = await nav.locator("a[href^='/']").evaluateAll((els) =>
    Array.from(new Set(els.map((e) => e.getAttribute("href")!))),
  );
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    const res = await page.goto(href);
    expect(res?.status(), `nav link ${href}`).toBeLessThan(400);
  }
});
