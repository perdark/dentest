import { test, expect } from "@playwright/test";

/**
 * The riskiest wiring in the app: a real form -> server action -> mutations
 * layer -> settlement read. `scripts/verify.ts` already proves the arithmetic
 * (D1-D9) against the data layer directly; what it cannot prove is that the
 * screens are actually connected to it. That is this file's only job.
 *
 * These three tests share one database and run in declared order (workers: 1),
 * so the later two read what the first one writes.
 */

const PATIENT = "مريض اختبار المتصفح";
const LIST_PRICE = "2000000";
const PAID_NOW = "500000";

test("a daily entry with a part payment reaches the monthly settlement", async ({
  page,
}) => {
  await page.goto("/daily");

  await page.getByRole("button", { name: "إضافة قيد" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("اسم المريض").fill(PATIENT);
  await dialog.getByLabel(/رقم الهاتف/).fill("07700000009");

  // «جسر» and not «زراعة»: the treatment is free text with saved suggestions
  // (2026-08-19), and find-or-create refuses a non-normal bucket name —
  // implants, ortho and x-rays are opened from their own screens because their
  // income is settled differently. [D9, mutations.findOrCreateTreatmentType]
  await dialog.locator("#nc-doctor").selectOption({ label: "د. عدي" });
  await dialog.locator("#nc-treatment").fill("جسر");

  // Prices are typed per case — the field starts empty and nothing suggests a
  // number, so the test supplies the whole agreed price itself.
  await dialog.locator("#nc-price").fill(LIST_PRICE);
  await dialog.locator("#nc-paid").fill(PAID_NOW);

  await dialog.getByRole("button", { name: "حفظ القيد" }).click();

  // useActionToast closes the dialog only after the action succeeds.
  await expect(dialog).toBeHidden();

  // The day's ledger shows the entry.
  await expect(page.getByText(PATIENT).first()).toBeVisible();

  await page.goto("/settlement");
  const table = page.locator('[data-tour="settlement-table"]').first();
  await expect(table).toBeVisible();

  // The doctor's row carries the 500,000 actually COLLECTED — the share is
  // computed on collected money, not on the 2,000,000 list price. [D1]
  // (The list price still appears in the separate "accrued" column, which is
  // why this asserts on the collected figure rather than the row as a whole.)
  const adiRow = table.getByRole("row").filter({ hasText: "د. عدي" }).first();
  await expect(adiRow).toContainText("500,000 د.ع");
});

test("the patient created through the daily entry appears in the patients list", async ({
  page,
}) => {
  await page.goto("/patients");
  await page.locator('[data-tour="patients-search"] input[name="q"]').fill(PATIENT);
  await page.locator('[data-tour="patients-search"]').press("Enter");

  await expect(page.locator('[data-tour="patients-list"]').first()).toContainText(
    PATIENT,
  );
});

test("the write is recorded in the audit log", async ({ page }) => {
  // The mutations layer owns audit logging (golden rule 1) — if a screen ever
  // writes around it, the log stays empty and this catches it. Asserting on the
  // count rather than the row text: the log's wording is not a contract.
  await page.goto("/audit");
  await expect(page.locator('[data-tour="audit-filters"]').first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("لا توجد تعديلات مطابقة");
  await expect(page.locator("body")).not.toContainText("آخر 0 تعديل");
});
