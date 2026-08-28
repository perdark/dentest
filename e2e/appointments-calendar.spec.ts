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
const TIMED_PATIENT = "مريض اختبار الأسبوع";
const UNTIMED_PATIENT = "مريض اختبار الجدول";

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

/**
 * عرض الأسبوع جدول أعمال لسبعة أيام، لا مسطرة ساعات: الوقت اختياري في هذا
 * البرنامج والعيادة نادراً ما تُدخله، فالموعد بلا وقت مواطن كامل في عمود يومه.
 */
test("the weekly agenda lists each day's appointments, timed or not", async ({
  page,
}) => {
  await page.goto("/appointments");

  await page.getByRole("button", { name: "حجز موعد" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("اسم المراجع").fill(TIMED_PATIENT);
  await dialog.locator("#ap-time").fill("10:30");
  await dialog.getByRole("button", { name: "حفظ الموعد" }).click();
  await expect(dialog).toBeHidden();

  // نفس اليوم، بلا وقت — هذا هو الشكل الغالب في الدفتر الحقيقي.
  await page.getByRole("button", { name: "حجز موعد" }).click();
  const second = page.getByRole("dialog");
  await second.getByLabel("اسم المراجع").fill(UNTIMED_PATIENT);
  await second.getByRole("button", { name: "حفظ الموعد" }).click();
  await expect(second).toBeHidden();

  await page.getByRole("button", { name: "أسبوع", exact: true }).click();
  const calendar = page.locator('[data-tour="appt-week"]');
  await expect(calendar).toBeVisible();

  // الأسبوع العراقي يبدأ السبت وينتهي الجمعة — رؤوس الأعمدة تثبت ذلك.
  await expect(calendar.getByText("السبت", { exact: true })).toBeVisible();
  await expect(calendar.getByText("الجمعة", { exact: true })).toBeVisible();

  // الموعد المؤقّت: الوقت بنظام ١٢ ساعة، والحالة مقروءة نصاً لا لوناً.
  const timedRow = calendar.getByRole("link", { name: new RegExp(TIMED_PATIENT) });
  await expect(timedRow).toContainText("10:30 ص");
  await expect(timedRow).toContainText("محجوز");

  // والموعد بلا وقت يظهر في نفس العمود موسوماً «بلا وقت» — لا يُنفى تحت الشبكة.
  const untimedRow = calendar.getByRole("link", { name: new RegExp(UNTIMED_PATIENT) });
  await expect(untimedRow).toContainText("بلا وقت");
  await expect(untimedRow).toContainText("محجوز");

  // فتح الموعد من التقويم يذهب إلى ملف المراجع.
  await timedRow.click();
  await expect(page.getByRole("heading", { name: TIMED_PATIENT })).toBeVisible();
});
