import assert from "node:assert/strict";
import { test } from "node:test";

import { formatDateShort, formatDateShortY, formatTime12 } from "@/lib/dates";

/**
 * كيف تُقرأ التواريخ والأوقات على الشاشة — طلب العيادة 2026-08-24.
 *
 * العيادة تتكلّم بنظام ١٢ ساعة («2:30 م»)، وتقرأ التواريخ بالأرقام («8/30») لا
 * بأسماء الأشهر. المخزَّن لم يتغيّر: قاعدة البيانات تبقى "YYYY-MM-DD" و"HH:MM"
 * بنظام ٢٤ ساعة، وهذه الدوال للعرض وحده.
 *
 * This is worth a test rather than a comment because both helpers are pure
 * string surgery over values that arrive from the DB in one fixed shape: the
 * boundaries that actually break (midnight, noon, a bad string) never appear
 * while clicking around the app at 3pm, and a wrong meridiem at 00:15 or 12:05
 * is the kind of error the clinic would read as a real appointment.
 */

test("formatTime12 — ٢٤ ساعة تصبح ١٢ ساعة بلاحقة عربية", () => {
  assert.equal(formatTime12("14:30"), "2:30 م");
  assert.equal(formatTime12("08:00"), "8:00 ص");
  // منتصف الليل والظهر: الصفر يصبح ١٢، والثانية عشرة ظهراً تبقى ١٢. [الحدّان]
  assert.equal(formatTime12("00:15"), "12:15 ص");
  assert.equal(formatTime12("12:05"), "12:05 م");
  assert.equal(formatTime12("00:00"), "12:00 ص");
  assert.equal(formatTime12("12:00"), "12:00 م");
  assert.equal(formatTime12("11:59"), "11:59 ص");
  assert.equal(formatTime12("13:00"), "1:00 م");
  assert.equal(formatTime12("23:45"), "11:45 م");
});

test("formatTime12 — الساعة بلا صفر بادئ والدقائق برقمين", () => {
  assert.equal(formatTime12("09:05"), "9:05 ص");
  assert.equal(formatTime12("20:00"), "8:00 م");
});

test("formatTime12 — الفارغ يبقى فارغاً وغير المقروء يعود كما هو", () => {
  assert.equal(formatTime12(null), "");
  assert.equal(formatTime12(undefined), "");
  assert.equal(formatTime12(""), "");
  assert.equal(formatTime12("مساءً"), "مساءً");
  assert.equal(formatTime12("1430"), "1430");
  assert.equal(formatTime12("25:00"), "25:00");
  assert.equal(formatTime12("10:75"), "10:75");
});

test("formatDateShort — شهر/يوم بلا أصفار بادئة", () => {
  assert.equal(formatDateShort("2026-08-30"), "8/30");
  assert.equal(formatDateShort("2026-01-05"), "1/5");
  assert.equal(formatDateShort("2026-12-31"), "12/31");
});

test("formatDateShortY — الشكل نفسه مع السنة", () => {
  assert.equal(formatDateShortY("2026-08-30"), "8/30/2026");
  assert.equal(formatDateShortY("2026-01-05"), "1/5/2026");
});

test("formatDateShort — الفارغ يبقى فارغاً وغير المقروء يعود كما هو", () => {
  assert.equal(formatDateShort(null), "");
  assert.equal(formatDateShort(undefined), "");
  assert.equal(formatDateShort(""), "");
  assert.equal(formatDateShort("2026-08"), "2026-08");
  assert.equal(formatDateShort("2026-13-01"), "2026-13-01");
  assert.equal(formatDateShort("غير محدَّد"), "غير محدَّد");
  assert.equal(formatDateShortY(null), "");
  assert.equal(formatDateShortY("2026-08"), "2026-08");
  assert.equal(formatDateShortY("2026-00-10"), "2026-00-10");
});
