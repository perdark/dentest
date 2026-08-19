import { test, expect } from "@playwright/test";

/**
 * The chronic-condition wiring: a real form -> server action -> mutations layer
 * -> the warning as it is actually read on screen, plus the server-side filters
 * on the same page.
 *
 * There is no arithmetic here on purpose (see playwright.config.ts). What this
 * file protects is the part no other suite can see: the tick boxes share one
 * field name, so a form that submits them wrongly would silently record a
 * patient as healthy — and the doctor would read that as fact.
 */

const PATIENT = "مريضة اختبار الحالة الصحية";
const MEDICAL_NOTE = "حساسية من البنسلين — تُستعمل بدائل";

test("a patient saved with chronic conditions carries the warning into the list", async ({
  page,
}) => {
  await page.goto("/patients");

  await page.getByRole("button", { name: "إضافة مريض" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("الاسم الكامل").fill(PATIENT);

  // Clicking the visible label is what the secretary does; it also proves the
  // label is wired to the box, which is the whole point of the tick grid.
  await dialog.getByText("سكري", { exact: true }).click();
  await dialog.getByText("حساسية", { exact: true }).click();
  await dialog.getByLabel("تفاصيل الحالة الصحية (اختياري)").fill(MEDICAL_NOTE);

  await dialog.getByRole("button", { name: "إضافة", exact: true }).click();
  await expect(dialog).toBeHidden();

  // Both flags survived the round trip, in the canonical order (سكري ثم حساسية).
  const list = page.locator('[data-tour="patients-list"]').first();
  const row = list.getByRole("row").filter({ hasText: PATIENT }).first();
  await expect(row).toContainText("سكري");
  await expect(row).toContainText("حساسية");
});

test("the patient file opens with the health warning above everything else", async ({
  page,
}) => {
  await page.goto("/patients");
  await page.locator('[data-tour="patients-search"] input[name="q"]').fill(PATIENT);
  await page.locator('[data-tour="patients-search"]').press("Enter");
  await page.locator('[data-tour="patients-list"]').getByText(PATIENT).click();

  const alert = page.getByRole("alert").filter({ hasText: "حالة صحية يجب الانتباه لها" });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("سكري");
  await expect(alert).toContainText(MEDICAL_NOTE);
});

test("the patients filters run on the server and combine with the search", async ({
  page,
}) => {
  // The patient has no case at all, so «عليهم رصيد» must exclude her — this is
  // the exists-subquery doing the work, not a client-side filter over the page.
  await page.goto(`/patients?q=${encodeURIComponent(PATIENT)}&balance=1`);
  await expect(page.locator("body")).toContainText("لا توجد نتائج مطابقة لبحثك");

  // Same search without the balance filter still finds her.
  await page.goto(`/patients?q=${encodeURIComponent(PATIENT)}`);
  await expect(page.locator('[data-tour="patients-list"]').first()).toContainText(
    PATIENT,
  );
});
