import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Cifrado en reposo de objetos binarios del almacenamiento de medios (AES-256-GCM).
 * Formato: MAGIC (4 bytes «IWE1») · IV (12) · TAG (16) · CIPHERTEXT.
 * Lo usan el worker (PDF del contrato, ADR-109 D5) y la API al servirlo o firmarlo.
 */
export const ENCRYPTED_OBJECT_MAGIC = Buffer.from('IWE1', 'ascii');
export const ENCRYPTED_OBJECT_CONTENT_TYPE = 'application/octet-stream';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = ENCRYPTED_OBJECT_MAGIC.length + IV_BYTES + TAG_BYTES;

function assertKey(key: Buffer): void {
  if (key.length !== 32) throw new Error('La clave de cifrado de objetos debe tener 32 bytes.');
}

export function encryptObjectBuffer(plain: Buffer, key: Buffer): Buffer {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([ENCRYPTED_OBJECT_MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}

/** Descifra con la clave activa y, si falla la autenticación, con las anteriores en orden. */
export function decryptObjectBuffer(blob: Buffer, keys: readonly Buffer[]): Buffer {
  if (blob.length < HEADER_BYTES || !blob.subarray(0, 4).equals(ENCRYPTED_OBJECT_MAGIC)) {
    throw new Error('Objeto cifrado con formato inválido.');
  }
  const iv = blob.subarray(4, 4 + IV_BYTES);
  const tag = blob.subarray(4 + IV_BYTES, HEADER_BYTES);
  const ciphertext = blob.subarray(HEADER_BYTES);
  let lastError: unknown = new Error('Sin claves para descifrar el objeto.');
  for (const key of keys) {
    try {
      assertKey(key);
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
