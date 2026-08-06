/**
 * Thin ESM wrapper — misma semántica que
 * `packages/database/src/migrations/shared/pii-hmac.util.ts` (SEC-P1).
 * Fuente de verdad TypeScript: @iwana/db (`hmacEmail` / `loadPiiHashKeyFromEnv`).
 * Nunca loguea plaintext ni la clave.
 */
import { createHmac } from 'node:crypto';

function isWeakHex64(hex) {
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
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Buffer}
 */
export function loadPiiHashKeyFromEnv(env = process.env) {
  const hex = env.PII_HASH_KEY;
  if (!hex || typeof hex !== 'string' || hex.trim().length === 0) {
    throw new Error(
      'PII_HASH_KEY es requerida para HMAC de PII. Genera una con: openssl rand -hex 32',
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
export function hmacPiiValue(value, key) {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

/**
 * HMAC-SHA-256 del email normalizado (toLowerCase + trim).
 * @param {string} email
 * @param {Buffer} key
 * @returns {string}
 */
export function hmacEmail(email, key) {
  return hmacPiiValue(email.toLowerCase().trim(), key);
}
