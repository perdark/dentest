import { test, expect, type Page } from "@playwright/test";

/**
 * «د. عدي» in «الدفتر اليومي»: each of the four buttons saves through the
 * dialog and its line lands under the matching section of the owner's card.
 * The arithmetic is proven in `tests/owner-entry.test.ts`; this only proves
 * the screen is connected. [قرار العيادة 2026-11-15]
 */

async function enter(page: Page, kind: string, name: string, amount: string, treatment?: string) {
  await page.locator('[data-tour="daily-owner"]').click();
  const dialog = page.getByRole("dialog");
  await dialog.locator(`[data-owner-kind="${kind}"]`).click();
  await dialog.getByLabel("اسم المريض").fill(name);
  if (treatment) await dialog.locator("#ow-treatment").fill(treatment);
  await dialog.locator("#ow-amount").fill(amount);
  await dialog.getByRole("button", { name: "حفظ" }).click();
  await expect(dialog).toBeHidden();
}

test("the owner's four notebook entries save and file under their sections", async ({ page }) => {
  await page.goto("/daily");

  await enter(page, "work", "عدي عمل عادي", "60000", "قلع");
  await enter(page, "delivery", "عدي توصيل قديم", "40000");
  await enter(page, "ortho", "عدي مقدمة تقويم", "250000");
  await enter(page, "implant", "عدي زراعة جديدة", "700000");

  const card = page.locator('[data-owner-section]');
  await expect(card.filter({ hasText: "عمل عادي" })).toContainText("عدي عمل عادي");
  await expect(card.filter({ hasText: "توصيل مبلغ" })).toContainText("عدي توصيل قديم");
  await expect(card.filter({ hasText: "تقويم" })).toContainText("عدي مقدمة تقويم");
  await expect(card.filter({ hasText: "زراعة" })).toContainText("عدي زراعة جديدة");
});
