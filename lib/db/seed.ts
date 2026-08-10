/**
 * Idempotent seed: doctors, treatment types, placeholder prices, settings,
 * counters. Run with `npm run db:seed`. Safe to run repeatedly.
 */
import { eq } from "drizzle-orm";
import { db } from "./client";
import { counters, doctors, priceList, settings, treatmentTypes } from "./schema";
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

const TREATMENTS = [
  { key: "implant", nameAr: "زراعة", nameEn: "Implant", settlementBucket: "implant", isImplant: true, isOrtho: false, sortOrder: 1, price: 1500000 },
  { key: "ortho", nameAr: "تقويم", nameEn: "Orthodontics", settlementBucket: "ortho", isImplant: false, isOrtho: true, sortOrder: 2, price: 1000000 },
  { key: "extraction_surgical", nameAr: "قلع جراحي", nameEn: "Surgical extraction", settlementBucket: "normal", isImplant: false, isOrtho: false, sortOrder: 3, price: 50000 },
  { key: "extraction_normal", nameAr: "قلع عادي", nameEn: "Normal extraction", settlementBucket: "normal", isImplant: false, isOrtho: false, sortOrder: 4, price: 25000 },
  { key: "filling", nameAr: "حشوة", nameEn: "Filling", settlementBucket: "normal", isImplant: false, isOrtho: false, sortOrder: 5, price: 50000 },
  { key: "bridge", nameAr: "جسر", nameEn: "Bridge", settlementBucket: "normal", isImplant: false, isOrtho: false, sortOrder: 6, price: 250000 },
  { key: "cleaning", nameAr: "تنظيف", nameEn: "Cleaning", settlementBucket: "normal", isImplant: false, isOrtho: false, sortOrder: 7, price: 25000 },
] as const;

function run() {
  // Settings (single row id=1)
  const existing = db.select().from(settings).where(eq(settings.id, 1)).get();
  if (!existing) {
    db.insert(settings)
      .values({ id: 1, pinHash: hashPin(DEFAULT_PIN), sessionSecret: newSecret() })
      .run();
    console.log(`• settings created (default PIN = ${DEFAULT_PIN} — change it in الإعدادات)`);
  } else {
    if (!existing.sessionSecret)
      db.update(settings).set({ sessionSecret: newSecret() }).where(eq(settings.id, 1)).run();
    if (!existing.pinHash)
      db.update(settings).set({ pinHash: hashPin(DEFAULT_PIN) }).where(eq(settings.id, 1)).run();
    console.log("• settings present");
  }

  // Doctors (seed only if empty)
  const docCount = db.select().from(doctors).all().length;
  if (docCount === 0) {
    for (const d of DOCTORS) db.insert(doctors).values(d).run();
    console.log(`• ${DOCTORS.length} doctors seeded`);
  } else {
    console.log(`• doctors present (${docCount})`);
  }

  // Treatment types + placeholder prices
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
    const tt = db.select().from(treatmentTypes).where(eq(treatmentTypes.key, t.key)).get()!;
    db.insert(priceList)
      .values({ treatmentTypeId: tt.id, defaultPrice: t.price, isPlaceholder: true })
      .onConflictDoNothing()
      .run();
  }
  console.log(`• ${TREATMENTS.length} treatment types + placeholder prices ensured`);

  // Counters
  db.insert(counters).values({ name: "implant_card_no", value: 0 }).onConflictDoNothing().run();
  db.insert(counters).values({ name: "account_seq_no", value: 0 }).onConflictDoNothing().run();
  console.log("• counters ensured");

  console.log("✅ seed complete");
}

run();
