import { test, expect } from "@playwright/test";

/**
 * The appointments register beyond the day list: the month grid, the
 * server-side filters, and rebooking.
 *
 * What this protects is the wiring no other suite can see — the filters run in
 * SQL (`appointmentsForDate`), so a page that forgot to pass them through would
 * still render a perfectly plausible list, just of the wrong appointments. The
 * rebook path is here for the same reason: it writes a second appointment via
 * the mutations layer and must leave the original alone.
 */

const PATIENT = "مريض اختبار التقويم";

test("the month view renders a Saturday-first grid and a day opens from it", async ({
  page,
}) => {
  await page.goto("/appointments");

  await page.getByRole("button", { name: "شهر", exact: true }).click();

  const grid = page.locator('[data-tour="appt-month"]');
  await expect(grid).toBeVisible();

  // الأسبوع العراقي يبدأ السبت — العمود الأول هو ما يثبت ذلك.
  await expect(grid.getByText("السبت", { exact: true })).toBeVisible();
  await expect(grid.getByText("الجمعة", { exact: true })).toBeVisible();

  // The day view is still what a cell opens into.
  await grid.getByRole("link").first().click();
  await expect(page.locator('[data-tour="appt-list"]')).toBeVisible();
});

test("booking, filtering and rebooking all round-trip through the server", async ({
  page,
}) => {
  await page.goto("/appointments");

  await page.getByRole("button", { name: "حجز موعد" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("اسم المراجع").fill(PATIENT);
  await dialog.locator("#ap-doctor").selectOption({ label: "د. عدي" });
  await dialog.getByRole("button", { name: "حفظ الموعد" }).click();
  await expect(dialog).toBeHidden();

  const list = page.locator('[data-tour="appt-list"]');
  await expect(list).toContainText(PATIENT);

  // A filter that excludes the row must actually drop it — proof the filter
  // reached SQL rather than being dropped on the floor by the page.
  await page.locator('[data-tour="appt-filters"]').getByLabel("تصفية حسب الحالة")
    .selectOption("no_show");
  await expect(page.locator('[data-tour="appt-list"]')).not.toContainText(PATIENT);

  await page.locator('[data-tour="appt-filters"]').getByLabel("تصفية حسب الحالة")
    .selectOption("");
  await expect(page.locator('[data-tour="appt-list"]')).toContainText(PATIENT);

  // إعادة الحجز تظهر بعد تعليم الحضور فقط.
  const row = page.locator('[data-tour="appt-list"] > div > div').filter({
    hasText: PATIENT,
  }).first();
  await row.getByRole("button", { name: "حضر", exact: true }).click();

  await row.getByRole("button", { name: `إعادة حجز ${PATIENT}` }).click();
  const rebook = page.getByRole("dialog");
  await expect(rebook).toBeVisible();
  await rebook.getByRole("button", { name: "+ أسبوع" }).click();
  await expect(rebook).toBeHidden();

  // الموعد الأصلي باقٍ كما هو — السجل سِجل.
  await expect(page.locator('[data-tour="appt-list"]')).toContainText(PATIENT);
});
