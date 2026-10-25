/**
 * One-time: make the key pair the Telegram backups are sealed with.
 *
 *   npm run backup:keygen -- ~/Desktop/_private/zuha-backup-private.pem
 *
 * Writes the PRIVATE key to the given path (mode 600, refuses to overwrite —
 * losing it means every backup already sent is unreadable) and appends the
 * PUBLIC key to .env.local as ZUHA_BACKUP_PUBLIC_KEY.
 */
import fs from "node:fs";
import path from "node:path";
import { makeBackupKeyPair } from "../lib/backup-crypto";

const out = process.argv[2];
if (!out) {
  console.error("usage: npm run backup:keygen -- <private-key-path>");
  process.exit(1);
}
if (fs.existsSync(out)) {
  console.error(`✗ ${out} already exists — not overwriting a key that may already seal backups.`);
  process.exit(1);
}
const envFile = path.join(process.cwd(), ".env.local");
const env = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
if (/^ZUHA_BACKUP_PUBLIC_KEY=/m.test(env)) {
  console.error("✗ .env.local already has ZUHA_BACKUP_PUBLIC_KEY.");
  process.exit(1);
}

const { publicKeyBase64, privateKeyPem } = makeBackupKeyPair();
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, privateKeyPem, { mode: 0o600 });
fs.appendFileSync(
  envFile,
  `${env && !env.endsWith("\n") ? "\n" : ""}ZUHA_BACKUP_PUBLIC_KEY=${publicKeyBase64}\n`,
);
console.log(`✓ private key → ${out}`);
console.log("✓ public key  → .env.local (ZUHA_BACKUP_PUBLIC_KEY)");
