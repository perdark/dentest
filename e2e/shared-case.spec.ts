import { test, expect } from "@playwright/test";

/**
 * «+ طبيب آخر» in the daily entry: one treatment, two doctors, two shares.
 * Proves only the wiring (form rows → server action → createSharedCases →
 * settlement). The arithmetic is in tests/multi-doctor-case.test.ts.
 */
const PATIENT = "مريض علاج مشترك";

test("a treatment shared by two doctors credits each with their own share", async ({ page }) => {
  await page.goto("/daily");
  await page.getByRole("button", { name: "تسجيل جديد" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("اسم المريض").fill(PATIENT);
  await dialog.locator("#nc-doctor").selectOption({ label: "د. علي قاسم" });
  await dialog.locator("#nc-treatment").fill("تاج");

  await dialog.getByRole("button", { name: "طبيب آخر" }).click();
  await expect(dialog.locator("#nc-doctor")).toHaveCount(0);
  // The doctor already picked becomes the first share.
  await expect(dialog.locator("#nc-share-0-doctor option:checked")).toHaveText("د. علي قاسم");
  await dialog.locator("#nc-share-1-doctor").selectOption({ label: "د. علي دوبرا" });
  await dialog.locator("#nc-share-0-price").fill("300000");
  await dialog.locator("#nc-share-0-paid").fill("130000");
  await dialog.locator("#nc-share-1-price").fill("200000");
  await dialog.locator("#nc-share-1-paid").fill("70000");

  // The running totals across both rows, before saving.
  await expect(dialog).toContainText("500,000 د.ع");
  await expect(dialog).toContainText("200,000 د.ع");

  await dialog.getByRole("button", { name: "حفظ التسجيل" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(PATIENT).first()).toBeVisible();

  await page.goto("/settlement");
  const table = page.locator('[data-tour="settlement-table"]').first();
  await expect(table).toBeVisible();
  await expect(table.getByRole("row").filter({ hasText: "د. علي قاسم" }).first()).toContainText(
    "130,000 د.ع",
  );
  await expect(table.getByRole("row").filter({ hasText: "د. علي دوبرا" }).first()).toContainText(
    "70,000 د.ع",
  );
});
