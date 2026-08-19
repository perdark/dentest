/**
 * Load or remove the demo dataset from a terminal.
 *
 *   npm run db:demo         — fill an empty database with three months of
 *                             fictional clinic life
 *   npm run db:demo:clear   — delete every record, keeping doctors, prices,
 *                             settings and the PIN
 *
 * The clinic laptop has no terminal — this exists for development and support.
 * The staff use the buttons on the الإعدادات page, which call the same code.
 */
import { fillDemoData, isDatabaseEmpty } from "@/lib/db/demo";
import { wipeAllRecords } from "@/lib/mutations";

const clear = process.argv.includes("--clear");

if (clear) {
  const removed = wipeAllRecords("مسح كل السجلات من سطر الأوامر");
  console.log("🧹 تم مسح السجلات:");
  console.table(removed);
  process.exit(0);
}

if (!isDatabaseEmpty()) {
  console.error(
    "✗ قاعدة البيانات تحتوي على مرضى بالفعل.\n" +
      "  التعبئة التجريبية تعمل على قاعدة فارغة فقط، حتى لا تختلط بالبيانات الحقيقية.\n" +
      "  لمسح كل السجلات: npm run db:demo:clear",
  );
  process.exit(1);
}

const result = fillDemoData();
console.log("✅ تم تحميل البيانات التجريبية:");
console.table(result);
console.log("   ⚠ هذه بيانات وهمية للتدريب — امسحها قبل تشغيل العيادة فعلياً.");
