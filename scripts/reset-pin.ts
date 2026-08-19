/**
 * Recovery path for a forgotten or mistyped clinic PIN. [E2]
 *
 * The clinic shares one PIN and there is no email, no second user, and no
 * cloud — so without this script a typo in "الرمز الجديد" locks everyone out of
 * the books permanently. Run it AT the clinic laptop:
 *
 *   npm run pin:reset            → resets to 1234
 *   npm run pin:reset -- 4821    → resets to 4821
 *
 * Requires filesystem access to zuha.db, which means physical access to the
 * machine — that is the intended security boundary for an on-prem system.
 */
import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { settings } from "../lib/db/schema";
import { hashPin, newSecret } from "../lib/crypto";

const DEFAULT_PIN = "1234";

function run() {
  const requested = process.argv[2]?.trim() ?? DEFAULT_PIN;
  if (!/^\d{4,}$/.test(requested)) {
    console.error("✗ الرمز يجب أن يكون أرقاماً فقط، 4 خانات على الأقل.");
    process.exit(1);
  }

  const existing = db.select().from(settings).where(eq(settings.id, 1)).get();
  if (!existing) {
    db.insert(settings)
      .values({ id: 1, pinHash: hashPin(requested), sessionSecret: newSecret() })
      .run();
  } else {
    db.update(settings)
      .set({
        pinHash: hashPin(requested),
        // Rotating the secret invalidates every existing session cookie, so a
        // logged-in browser cannot outlive the reset.
        sessionSecret: newSecret(),
        updatedAt: Date.now(),
      })
      .where(eq(settings.id, 1))
      .run();
  }

  console.log(`✅ تم ضبط رمز الدخول على: ${requested}`);
  console.log("   غيّره فوراً من صفحة الإعدادات، وسُجّل الخروج من كل الأجهزة.");
}

run();
