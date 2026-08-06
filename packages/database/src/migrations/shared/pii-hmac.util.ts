import * as crypto from 'crypto';

/**
 * HMAC-SHA-256 para backfills de columnas `*_hmac` (SEC-P1 / migraciones 108+).
 * Misma semántica que `apps/api` `pii-hash-key.util` — sin import cruzado.
 * Nunca loguea plaintext ni la clave.
 */

function isWeakHex64(hex: string): boolean {
  if (hex.length !== 64) {
    return true;
  }
  const lower = hex.toLowerCase();
  if (lower === '0'.repeat(64) || lower === 'f'.repeat(64)) {
    return true;
  }
  return /^(.)\1{63}$/u.test(lower);
}

/**
 * Carga `PII_HASH_KEY` desde env. Fail-fast con mensaje explícito.
 */
export function loadPiiHashKeyFromEnv(env: NodeJS.ProcessEnv = process.env): Buffer {
  const hex = env.PII_HASH_KEY;
  if (!hex || typeof hex !== 'string' || hex.trim().length === 0) {
    throw new Error(
      'PII_HASH_KEY es requerida para backfill HMAC de PII (migración 108). ' +
        'Genera una con: openssl rand -hex 32',
    );
  }

  const trimmed = hex.trim();
  if (!/^[0-9a-fA-F]{64}$/u.test(trimmed)) {
    throw new Error('PII_HASH_KEY debe ser exactamente 64 caracteres hexadecimales ([0-9a-fA-F]).');
  }

  if (isWeakHex64(trimmed)) {
    throw new Error(
      'PII_HASH_KEY tiene entropía nula o es un placeholder. Genera una con: openssl rand -hex 32',
    );
  }

  return Buffer.from(trimmed, 'hex');
}

/** HMAC-SHA-256 hex (64 chars). */
export function hmacPiiValue(value: string, key: Buffer): string {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

export function hmacDocumentNumber(documentNumber: string, key: Buffer): string {
  return hmacPiiValue(documentNumber, key);
}

export function hmacEmail(email: string, key: Buffer): string {
  return hmacPiiValue(email.toLowerCase().trim(), key);
}

export function hmacPhone(phone: string, key: Buffer): string {
  return hmacPiiValue(phone, key);
}
