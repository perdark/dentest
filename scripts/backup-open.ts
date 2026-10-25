/**
 * Turn a sealed Telegram backup back into a database file.
 *
 *   npm run backup:open -- <file.zbak> <private-key.pem> [out.db]
 *
 * The output is an ordinary zuha-*.db: open it with any SQLite viewer, or put
 * it in the clinic's backups folder and use «استعادة نسخة محفوظة».
 */
import fs from "node:fs";
import { openBackup } from "../lib/backup-crypto";

const [input, keyFile, outArg] = process.argv.slice(2);
if (!input || !keyFile) {
  console.error("usage: npm run backup:open -- <file.zbak> <private-key.pem> [out.db]");
  process.exit(1);
}
const out = outArg || input.replace(/\.zbak$/, "") + ".db";
const db = openBackup(fs.readFileSync(input), fs.readFileSync(keyFile, "utf8"));
if (db.subarray(0, 16).toString("latin1") !== "SQLite format 3\0") {
  console.error("✗ decrypted, but the result is not a SQLite database.");
  process.exit(1);
}
fs.writeFileSync(out, db);
console.log(`✓ ${out} (${(db.length / 1024).toFixed(0)} KB)`);
