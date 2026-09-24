import { test, expect } from "@playwright/test";

/**
 * Bringing an old paper patient in, and keeping one file per patient.
 *
 * «إضافة علاج» on the patient file opens a case, takes its payment and charts
 * its teeth in one save; «مريض مسجّل» in «الدفتر اليومي» puts a new case on an
 * existing file instead of making a second patient with the same name. What
 * this file proves is the wiring (form → action → mutations → the file as it
 * is read back); the arithmetic stays in `npm test` / `npm run verify`.
 */

const PATIENT = "مريض الدفتر القديم";

test("a treatment added from the patient file lands on it with its tooth", async ({ page }) => {
  await page.goto("/patients");
  await page.getByRole("button", { name: "إضافة مريض" }).click();
  const create = page.getByRole("dialog");
  await create.getByLabel("الاسم الكامل").fill(PATIENT);
  await create.getByLabel("الطبيب المسؤول").selectOption({ index: 1 });
  await create.getByRole("button", { name: "إضافة", exact: true }).click();
  await expect(create).toBeHidden();

  await page.locator('[data-tour="patients-list"]').getByText(PATIENT).click();
  await page.getByRole("button", { name: "إضافة علاج" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.locator("#pt-treatment").fill("حشوة");
  // An old notebook entry: a real past date, inside the recordable range.
  await dialog.locator("#pt-date").fill("2026-02-10");
  await dialog.locator("#pt-price").fill("100000");
  await dialog.locator("#pt-paid").fill("100000");

  await dialog.getByRole("checkbox").first().click();
  await dialog.locator("#tooth-note").fill("حشوة عميقة");

  await dialog.getByRole("button", { name: "حفظ العلاج" }).click();
  await expect(dialog).toBeHidden();

  const row = page.getByRole("row").filter({ hasText: "حشوة" }).first();
  await expect(row).toBeVisible();
  // The chart column counts the marked teeth — the tooth travelled with the case.
  await expect(row.getByRole("link", { name: /مخطط أسنان/ })).toContainText("1");
});

test("«مريض مسجّل» in the daily entry adds to the same file", async ({ page }) => {
  await page.goto("/daily");
  await page.getByRole("button", { name: "تسجيل جديد" }).click();
  const dialog = page.getByRole("dialog");

  await dialog.getByRole("button", { name: "مريض مسجّل" }).click();
  await dialog.getByLabel("ابحث عن المريض").fill("الدفتر القديم");
  await dialog.getByRole("button", { name: PATIENT }).click();

  await dialog.locator("#nc-treatment").fill("تنظيف");
  await dialog.locator("#nc-price").fill("50000");
  await dialog.getByRole("button", { name: "حفظ التسجيل" }).click();
  await expect(dialog).toBeHidden();

  await page.goto(`/patients?q=${encodeURIComponent(PATIENT)}`);
  const list = page.locator('[data-tour="patients-list"]').first();
  // One file, not two.
  await expect(list.getByRole("link", { name: PATIENT })).toHaveCount(1);
  await list.getByText(PATIENT).click();
  await expect(page.getByRole("row").filter({ hasText: "تنظيف" })).toHaveCount(1);
  await expect(page.getByRole("row").filter({ hasText: "حشوة" })).toHaveCount(1);
});
