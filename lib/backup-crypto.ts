import crypto from "node:crypto";
import zlib from "node:zlib";

/**
 * Sealed backup format («.zbak») for the off-site copy sent to Telegram.
 *
 * The bot token ships inside the installer, and the installer is a public
 * GitHub release — so anyone can extract the token and pull every file the bot
 * ever sent. That is survivable only because what the bot sends is sealed to a
 * PUBLIC key: the clinic laptop can lock a backup but never unlock one. The
 * private key lives on the developer's machine alone (~/Desktop/_private), and
 * `npm run backup:open` is the only way back to a .db file.
 *
 * Layout: "ZBK1" | u16 BE wrapped-key length | RSA-OAEP-SHA256(aes key) |
 *         12-byte IV | 16-byte GCM tag | AES-256-GCM(gzip(db bytes))
 */

const MAGIC = Buffer.from("ZBK1");

export function sealBackup(db: Buffer, publicKeyBase64: string): Buffer {
  const publicKey = crypto.createPublicKey({
    key: Buffer.from(publicKeyBase64, "base64"),
    format: "der",
    type: "spki",
  });
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const wrapped = crypto.publicEncrypt(
    { key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    key,
  );
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(zlib.gzipSync(db)), cipher.final()]);
  const len = Buffer.alloc(2);
  len.writeUInt16BE(wrapped.length);
  return Buffer.concat([MAGIC, len, wrapped, iv, cipher.getAuthTag(), body]);
}

export function openBackup(sealed: Buffer, privateKeyPem: string): Buffer {
  if (!sealed.subarray(0, 4).equals(MAGIC)) throw new Error("not a Zuha sealed backup");
  const wrappedLen = sealed.readUInt16BE(4);
  let at = 6;
  const wrapped = sealed.subarray(at, (at += wrappedLen));
  const iv = sealed.subarray(at, (at += 12));
  const tag = sealed.subarray(at, (at += 16));
  const body = sealed.subarray(at);
  const key = crypto.privateDecrypt(
    { key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    wrapped,
  );
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return zlib.gunzipSync(Buffer.concat([decipher.update(body), decipher.final()]));
}

/** A fresh key pair: base64 SPKI DER (for .env.local) + PKCS#8 PEM (keep private). */
export function makeBackupKeyPair(): { publicKeyBase64: string; privateKeyPem: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 3072 });
  return {
    publicKeyBase64: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  };
}
