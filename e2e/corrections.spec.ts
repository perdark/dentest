import { test, expect } from "@playwright/test";

/**
 * Correcting a record entered by mistake (2026-09-27): a payment, a treatment,
 * a whole patient and an appointment can be edited or deleted from the screen
 * where the clerk sees them. The money rules behind each correction are proven
 * in `tests/corrections.test.ts`; this file proves the buttons are connected.
 */

const PATIENT = "مريض للتصحيح";
const VISITOR = "مراجع للتعديل";

test("a payment and a treatment are corrected, then the patient is deleted", async ({ page }) => {
  await page.goto("/patients");
  await page.getByRole("button", { name: "إضافة مريض" }).click();
  const create = page.getByRole("dialog");
  await create.getByLabel("الاسم الكامل").fill(PATIENT);
  await create.getByLabel("الطبيب المسؤول").selectOption({ index: 1 });
  await create.getByRole("button", { name: "إضافة", exact: true }).click();
  await expect(create).toBeHidden();
  await page.locator('[data-tour="patients-list"]').getByText(PATIENT).click();

  await page.getByRole("button", { name: "إضافة علاج" }).click();
  const add = page.getByRole("dialog");
  await add.locator("#pt-treatment").fill("قلع");
  await add.locator("#pt-price").fill("60000");
  await add.locator("#pt-paid").fill("20000");
  await add.getByRole("button", { name: "حفظ العلاج" }).click();
  await expect(add).toBeHidden();

  // ── تعديل الدفعة: 20,000 → 30,000
  await page.getByRole("button", { name: `تعديل دفعة ${PATIENT}` }).click();
  const pay = page.getByRole("dialog");
  await pay.getByLabel("المبلغ").fill("30000");
  await pay.getByRole("button", { name: "حفظ التعديل" }).click();
  await expect(pay).toBeHidden();
  await expect(page.getByText("تم تعديل الدفعة")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "30,000" }).first()).toBeVisible();

  // ── تعديل العلاج: السعر 60,000 → 90,000
  await page.getByRole("button", { name: "تعديل قلع" }).click();
  const edit = page.getByRole("dialog");
  await edit.getByLabel("السعر").fill("90000");
  await edit.getByRole("button", { name: "حفظ التعديل" }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByText("تم تعديل العلاج")).toBeVisible();
  const cases = page.locator('[data-tour="patient-cases"]');
  await expect(cases.getByRole("row").filter({ hasText: "90,000" })).toHaveCount(1);

  // ── حذف العلاج: النافذة تقول إن دفعته تُحذف معه
  await page.getByRole("button", { name: "حذف قلع" }).click();
  const delCase = page.getByRole("dialog");
  await expect(delCase).toContainText("دفعة");
  await expect(delCase).toContainText("هل أنت متأكد؟");
  await delCase.getByRole("button", { name: "نعم، احذف" }).click();
  await expect(delCase).toBeHidden();
  await expect(page.getByText("لا توجد حالات لهذا المريض بعد")).toBeVisible();

  // ── حذف المريض: يعود إلى قائمة المرضى، والملف لم يعد فيها
  await page.getByRole("button", { name: `حذف المريض ${PATIENT}` }).click();
  const delPatient = page.getByRole("dialog");
  await expect(delPatient).toContainText("هل أنت متأكد؟");
  await delPatient.getByRole("button", { name: "نعم، احذف" }).click();
  await page.waitForURL(/\/patients(\?|$)/);
  await expect(page.getByText("تم حذف المريض وكل سجلاته")).toBeVisible();
  await page.goto(`/patients?q=${encodeURIComponent(PATIENT)}`);
  await expect(
    page.locator('[data-tour="patients-list"]').getByText(PATIENT),
  ).toHaveCount(0);
});

test("an appointment is edited in place", async ({ page }) => {
  await page.goto("/appointments");
  await page.getByRole("button", { name: "حجز موعد" }).click();
  const book = page.getByRole("dialog");
  await book.getByLabel("اسم المراجع").fill(VISITOR);
  await book.getByRole("button", { name: "حفظ الموعد" }).click();
  await expect(book).toBeHidden();

  await page.getByRole("button", { name: `تعديل موعد ${VISITOR}` }).click();
  const edit = page.getByRole("dialog");
  await edit.getByLabel("ملاحظة (اختياري)").fill("يحتاج أشعة");
  await edit.getByRole("button", { name: "حفظ التعديل" }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByText("يحتاج أشعة")).toBeVisible();
});

test("the doctor's % has one home: not in settings, read-only in the settlement", async ({
  page,
}) => {
  await page.goto("/settings");
  await expect(page.getByText("الأطباء والنِّسَب")).toHaveCount(0);
  await expect(page.getByText("طريقة رواتب الموظفين")).toHaveCount(0);

  await page.goto("/settlement");
  await expect(page.getByRole("spinbutton", { name: /^نسبة / })).toHaveCount(0);
});

test("an ortho case's next appointment is booked in «المواعيد»", async ({ page }) => {
  const ORTHO = "مريض تقويم بموعد";
  const next = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

  await page.goto("/ortho");
  await page.getByRole("button", { name: "حالة تقويم جديدة" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#patientName").fill(ORTHO);
  await dialog.locator("#nextAppointment").fill(next);
  await dialog.getByRole("button", { name: "حفظ الحالة" }).click();
  await expect(dialog).toBeHidden();

  await page.goto(`/appointments?date=${next}`);
  await expect(page.locator('[data-tour="appt-list"]').getByText(ORTHO)).toBeVisible();
});
