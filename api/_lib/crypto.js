// AES-256-GCM encryption for Fellow credentials
// Packed format: iv (12 bytes) + authTag (16 bytes) + ciphertext (variable)
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function getKey() {
  const hex = process.env.FELLOW_ENCRYPTION_KEY;
  if (!hex) throw new Error('FELLOW_ENCRYPTION_KEY not configured');
  return Buffer.from(hex, 'hex'); // 64 hex chars = 32 bytes
}

export function encrypt(plaintext) {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decrypt(packed) {
  const key = getKey();
  const buf = Buffer.from(packed, 'base64');
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  try {
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Decryption failed: data may be tampered or key is wrong');
  }
}
