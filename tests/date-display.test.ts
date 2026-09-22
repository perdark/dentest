import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EARLIEST_RECORD_DATE,
  formatDateShort,
  formatDateShortY,
  formatTime12,
  isRecordableDate,
  isValidISODate,
} from "@/lib/dates";

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

/**
 * 🔴 The window a RECORD's date has to sit in — the gap that let a payment be
 * dated 2099.
 *
 * `isValidISODate` answers "is this a day on a calendar", which «2099-12-31»
 * is, so it passed every check in the app. A payment saved there leaves
 * «تحصيل الشهر» and the monthly settlement while still counting in «النقد
 * المتوفر» and in the patient's balance, so the two figures the owner
 * reconciles stop agreeing with nothing to explain why. `today` is injected
 * rather than read from the clock: a test that asserts on "tomorrow" has to
 * say which day it means or it passes for the wrong reason.
 */
test("isRecordableDate — اليوم وما قبله مقبول، والغد مرفوض", () => {
  const today = "2026-09-22";
  assert.equal(isRecordableDate("2026-09-22", today), true);
  assert.equal(isRecordableDate("2026-09-21", today), true);
  assert.equal(isRecordableDate("2020-01-01", today), true);

  assert.equal(isRecordableDate("2026-09-23", today), false);
  assert.equal(isRecordableDate("2099-12-31", today), false);
  assert.equal(isRecordableDate("2062-09-22", today), false, "سنة مكتوبة خطأً");
  assert.equal(isRecordableDate("2019-12-31", today), false);
  assert.equal(isRecordableDate("1900-01-01", today), false);
});

test("isRecordableDate — ما يرفضه التقويم يبقى مرفوضاً", () => {
  const today = "2026-09-22";
  // Every calendar rejection still applies: the window narrows the valid set,
  // it does not replace the validity check.
  for (const bad of ["", "2026-02-31", "2026-13-01", "2026-9-2", "اليوم", "2026-09"]) {
    assert.equal(isValidISODate(bad), false, bad);
    assert.equal(isRecordableDate(bad, today), false, bad);
  }
  // The floor is a constant the date inputs also read as their `min`.
  assert.equal(EARLIEST_RECORD_DATE, "2020-01-01");
  assert.equal(isRecordableDate(EARLIEST_RECORD_DATE, today), true);
});
