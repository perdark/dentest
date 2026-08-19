/**
 * Idempotent seed: doctors, treatment types, settings, counters.
 * Run with `npm run db:seed`. Safe to run repeatedly.
 *
 * No prices are seeded: «قائمة الأسعار» was removed 2026-08-19 because the
 * clinic prices every case individually. The `price_list` table stays in the
 * schema but nothing writes to it any more.
 */
import { eq } from "drizzle-orm";
import { db } from "./client";
import { counters, doctors, settings, treatmentTypes } from "./schema";
import { hashPin, newSecret } from "../crypto";

const DEFAULT_PIN = "1234";

// commissionPct is deliberately NULL for every doctor: the real percentages are
// UNCONFIRMED with the clinic (BRIEF.md "STILL UNKNOWN"). NULL is what makes the
// «غير مؤكد» badge appear in الإعدادات — hardcoding a guess here would make an
// invented number look confirmed. The settlement falls back to
// settings.defaultCommissionPct until the clinic gives the real figures. [C1]
const DOCTORS = [
  { name: "د. عدي", isOwner: true, doesOrtho: false, commissionPct: null, sortOrder: 1 },
  { name: "د. علي قاسم", isOwner: false, doesOrtho: false, commissionPct: null, sortOrder: 2 },
  { name: "د. دوبرا", isOwner: false, doesOrtho: false, commissionPct: null, sortOrder: 3 },
  { name: "د. نور", isOwner: false, doesOrtho: false, commissionPct: null, sortOrder: 4 },
  { name: "د. زهرة", isOwner: false, doesOrtho: true, commissionPct: null, sortOrder: 5 },
];

// No `price` column here on purpose: every case is priced when it is opened.
const TREATMENTS = [
  { key: "implant", nameAr: "زراعة", nameEn: "Implant", settlementBucket: "implant", isImplant: true, isOrtho: false, sortOrder: 1 },
  { key: "ortho", nameAr: "تقويم", nameEn: "Orthodontics", settlementBucket: "ortho", isImplant: false, isOrtho: true, sortOrder: 2 },
  { key: "extraction_surgical", nameAr: "قلع جراحي", nameEn: "Surgical extraction", settlementBucket: "normal", isImplant: false, isOrtho: false, sortOrder: 3 },
  { key: "extraction_normal", nameAr: "قلع عادي", nameEn: "Normal extraction", settlementBucket: "normal", isImplant: false, isOrtho: false, sortOrder: 4 },
  { key: "filling", nameAr: "حشوة", nameEn: "Filling", settlementBucket: "normal", isImplant: false, isOrtho: false, sortOrder: 5 },
  { key: "bridge", nameAr: "جسر", nameEn: "Bridge", settlementBucket: "normal", isImplant: false, isOrtho: false, sortOrder: 6 },
  { key: "cleaning", nameAr: "تنظيف", nameEn: "Cleaning", settlementBucket: "normal", isImplant: false, isOrtho: false, sortOrder: 7 },
  // الأشعة — bucket "xray": clinic income, never inside a doctor's share. [D9]
  { key: "xray_panoramic", nameAr: "أشعة بانوراما", nameEn: "Panoramic X-ray (OPG)", settlementBucket: "xray", isImplant: false, isOrtho: false, sortOrder: 8 },
  { key: "xray_periapical", nameAr: "أشعة ذروية", nameEn: "Periapical X-ray", settlementBucket: "xray", isImplant: false, isOrtho: false, sortOrder: 9 },
  { key: "xray_cbct", nameAr: "أشعة ثلاثية الأبعاد", nameEn: "CBCT scan", settlementBucket: "xray", isImplant: false, isOrtho: false, sortOrder: 10 },
  { key: "xray_ceph", nameAr: "أشعة سيفالومترية", nameEn: "Cephalometric X-ray", settlementBucket: "xray", isImplant: false, isOrtho: false, sortOrder: 11 },
] as const;

function log(...a: unknown[]): void {
  if (process.env.ZUHA_QUIET !== "1") console.log(...a);
}

export function seed(): void {
  // Settings (single row id=1)
  const existing = db.select().from(settings).where(eq(settings.id, 1)).get();
  if (!existing) {
    db.insert(settings)
      .values({ id: 1, pinHash: hashPin(DEFAULT_PIN), sessionSecret: newSecret() })
      .run();
    log(`• settings created (default PIN = ${DEFAULT_PIN} — change it in الإعدادات)`);
  } else {
    if (!existing.sessionSecret)
      db.update(settings).set({ sessionSecret: newSecret() }).where(eq(settings.id, 1)).run();
    if (!existing.pinHash)
      db.update(settings).set({ pinHash: hashPin(DEFAULT_PIN) }).where(eq(settings.id, 1)).run();
    log("• settings present");
  }

  // Doctors (seed only if empty)
  const docCount = db.select().from(doctors).all().length;
  if (docCount === 0) {
    for (const d of DOCTORS) db.insert(doctors).values(d).run();
    log(`• ${DOCTORS.length} doctors seeded`);
  } else {
    log(`• doctors present (${docCount})`);
  }

  // Treatment types
  for (const t of TREATMENTS) {
    db.insert(treatmentTypes)
      .values({
        key: t.key,
        nameAr: t.nameAr,
        nameEn: t.nameEn,
        settlementBucket: t.settlementBucket,
        isImplant: t.isImplant,
        isOrtho: t.isOrtho,
        sortOrder: t.sortOrder,
      })
      .onConflictDoNothing()
      .run();
  }
  log(`• ${TREATMENTS.length} treatment types ensured`);

  // Counters
  db.insert(counters).values({ name: "implant_card_no", value: 0 }).onConflictDoNothing().run();
  db.insert(counters).values({ name: "account_seq_no", value: 0 }).onConflictDoNothing().run();
  log("• counters ensured");

  log("✅ seed complete");
}

// CLI entry: `npm run db:seed`.
if (process.argv[1] && process.argv[1].includes("seed")) seed();
