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

  await page.getByRole("button", { name: "تسجيل جديد" }).click();
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

  await dialog.getByRole("button", { name: "حفظ التسجيل" }).click();

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

/**
 * The refund path has no other browser cover. «النوع» moved onto the debts
 * dialog on 2026-09-22 when «دفعة على علاج سابق» was removed from the daily
 * screen, and a refund is the one kind that flips the sign of the money: if the
 * select ever stops reaching the action, every refund silently becomes a
 * payment. That wiring — select -> recordDebtPayment -> recordCasePayment — is
 * all this test asserts. The arithmetic itself is `tests/payment-collection`.
 */
test("a refund recorded from «الديون» raises the balance instead of lowering it", async ({
  page,
}) => {
  await page.goto("/debts");
  const row = page
    .locator('[data-tour="debts-list"]')
    .getByRole("row")
    .filter({ hasText: PATIENT })
    .first();
  // 2,000,000 opened, 500,000 collected by the first test in this file.
  await expect(row).toContainText("1,500,000");

  await row.getByRole("button", { name: "إضافة دفعة" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("المبلغ").fill("100000");
  await dialog.getByLabel("النوع").selectOption({ label: "استرجاع" });
  await dialog.getByRole("button", { name: "حفظ الدفعة" }).click();
  await expect(dialog).toBeHidden();

  // Up by the refund, not down: the clinic gave 100,000 back, so it is owed
  // that much more on the case.
  await expect(
    page
      .locator('[data-tour="debts-list"]')
      .getByRole("row")
      .filter({ hasText: PATIENT })
      .first(),
  ).toContainText("1,600,000");
});

/**
 * «النوع» offers only the two kinds that behave differently, and the date
 * cannot be pushed past today.
 *
 * Both are about what the menu ALLOWS rather than what the money does, which
 * is why they belong here and not in `tests/`. «تسوية» was dropped on
 * 2026-09-22 because no code branched on it — «الدليل» told the clinic to use
 * it to correct an account and it was stored as ordinary money in, paying
 * commission on cash that never arrived. If either option comes back onto this
 * dialog, this fails.
 */
test("«الديون» offers only جلسة and استرجاع, and cannot be dated ahead", async ({
  page,
}) => {
  await page.goto("/debts");
  await page
    .locator('[data-tour="debts-list"]')
    .getByRole("row")
    .filter({ hasText: PATIENT })
    .first()
    .getByRole("button", { name: "إضافة دفعة" })
    .click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const kind = dialog.getByLabel("النوع");
  await expect(kind.locator("option")).toHaveText(["جلسة", "استرجاع"]);
  await expect(kind).toHaveValue("session");

  // The native picker refuses a later day itself; `max` is what tells it to.
  const date = dialog.getByLabel("التاريخ");
  const today = await date.inputValue();
  await expect(date).toHaveAttribute("max", today);
  await expect(date).toHaveAttribute("min", "2020-01-01");
});
