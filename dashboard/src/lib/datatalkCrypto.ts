import { createDecipheriv, createCipheriv, createHash, randomBytes } from "crypto";

function getKey(): Buffer {
  const raw = process.env.DATATALK_META_ENCRYPTION_KEY ?? "";
  if (!raw) {
    throw new Error("DATATALK_META_ENCRYPTION_KEY is not set");
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

export function canUseEncryption(): boolean {
  return Boolean(process.env.DATATALK_META_ENCRYPTION_KEY);
}

export function encryptString(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptString(blob: string): string {
  const key = getKey();
  const buf = Buffer.from(blob, "base64");
  if (buf.length < 12 + 16) {
    throw new Error("Invalid encrypted payload");
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}
