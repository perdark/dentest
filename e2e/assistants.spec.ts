import { test, expect } from "@playwright/test";

/**
 * «المساعدون» → «الحصيلة الشهرية». [2026-10-28]
 *
 * The arithmetic lives in tests/assistants.test.ts; this proves the wiring:
 * the form reaches the mutations layer, and the settlement screen shows the
 * assistant's pay as taken out of his doctor's share.
 */
test("an assistant added on his screen appears in the month's settlement", async ({ page }) => {
  await page.goto("/assistants");
  await expect(page.locator('[data-tour="assistants-list"]')).toBeVisible();

  await page.getByRole("button", { name: "إضافة مساعد" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("اسم المساعد").fill("مساعدة الاختبار");
  await dialog.getByLabel("الراتب الشهري (د.ع)").fill("150000");
  // The live line says what the salary takes from the doctor before saving.
  await expect(dialog).toContainText("أجر هذا المساعد");
  await dialog.getByRole("button", { name: "إضافة", exact: true }).click();

  const list = page.locator('[data-tour="assistants-list"]');
  await expect(list).toContainText("مساعدة الاختبار");
  await expect(list).toContainText("150,000");

  await page.goto("/settlement");
  await expect(page.locator('[data-tour="settlement-table"]')).toBeVisible();
  await expect(page.getByText("أجور المساعدين").first()).toBeVisible();
  await expect(page.getByText("مساعدة الاختبار")).toBeVisible();
});
