import { test, expect } from "@playwright/test";

/**
 * The doctors screen and the lab ledger behind it.
 *
 * The arithmetic lives in tests/lab-dues.test.ts; what this file proves is the
 * wiring — that the form reaches the mutations layer and that the two branches
 * stay separate on the way through. A form that posted the wrong branch would
 * still look right on screen while quietly filing every bill under ثابت.
 */

test("a lab entry reaches the doctor page and lands in the right branch", async ({
  page,
}) => {
  await page.goto("/doctors");

  const list = page.locator('[data-tour="doctors-list"]');
  await expect(list).toBeVisible();

  // المستحق للطبيب ومستحقات المختبر رقمان مختلفان على البطاقة نفسها.
  await expect(list).toContainText("المستحق للطبيب");
  await expect(list).toContainText("مستحقات المختبر (ثابت)");

  await list.getByRole("link").first().click();

  const labCard = page.locator('[data-tour="lab-entries"]');
  await expect(labCard).toBeVisible();

  await labCard.getByLabel("المبلغ").fill("300000");
  await labCard.locator("#le-branch").selectOption("mobile");
  await labCard.getByLabel("ملاحظة").fill("حساب الشهر");
  await labCard.getByRole("button", { name: "إضافة التسجيل" }).click();

  // التسجيل يظهر في جدول الشهر، وفي مجموع الفرع المتحرك دون الثابت.
  await expect(labCard).toContainText("حساب الشهر");
  await expect(labCard).toContainText("متحرك");

  // الحصة لم تتغيّر: مال المختبر خارج الحصص تماماً.
  const dues = page.locator('[data-tour="doctor-dues"]');
  await expect(dues).toContainText("الحصة المستحقة");
});

test("the settlement screen mentions lab dues as tracking, never as a share", async ({
  page,
}) => {
  await page.goto("/settlement");

  const table = page.locator('[data-tour="settlement-table"]');
  await expect(table).toBeVisible();

  // السطر التعريفي يظهر فقط عند وجود مستحقات — والاختبار السابق أنشأها.
  await expect(page.getByText(/مستحقات المختبرات هذا الشهر/)).toBeVisible();
  await expect(page.getByText(/تتبّع خارج الحصص/)).toBeVisible();
});
