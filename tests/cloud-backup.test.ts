import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { makeBackupKeyPair, openBackup, sealBackup } from "../lib/backup-crypto";

// The off-site copy is only safe because the laptop can seal but never open.
const pair = makeBackupKeyPair();
const db = Buffer.concat([Buffer.from("SQLite format 3\0"), crypto.randomBytes(50_000)]);

test("a sealed backup opens with the private key, byte for byte", () => {
  const sealed = sealBackup(db, pair.publicKeyBase64);
  assert.deepEqual(openBackup(sealed, pair.privateKeyPem), db);
});

test("the sealed file does not contain the database in the clear", () => {
  const sealed = sealBackup(db, pair.publicKeyBase64);
  assert.equal(sealed.includes(Buffer.from("SQLite format 3")), false);
});

test("a different private key cannot open it", () => {
  const other = makeBackupKeyPair();
  const sealed = sealBackup(db, pair.publicKeyBase64);
  assert.throws(() => openBackup(sealed, other.privateKeyPem));
});

test("a tampered file is refused, not silently restored", () => {
  const sealed = sealBackup(db, pair.publicKeyBase64);
  sealed[sealed.length - 10] ^= 0xff;
  assert.throws(() => openBackup(sealed, pair.privateKeyPem));
});
