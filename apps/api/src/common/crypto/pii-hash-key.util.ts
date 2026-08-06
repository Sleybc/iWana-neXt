import * as crypto from 'crypto';
import * as Joi from 'joi';
import { isWeakMfaEncryptionKeyHex } from './aes-gcm.util';

/**
 * Clave dedicada HMAC-SHA-256 para búsquedas por PII (SEC-P1 / ADR-078 D3).
 * Independiente de MFA_ENCRYPTION_KEY (ADR-058): rotar cifrado no fuerza
 * recalcular hashes, y viceversa. Rotar PII_HASH_KEY exige backfill completo
 * (ver runbook) — sin columna de versión de clave en este corte (D-D).
 */

/** Reutiliza el detector de entropía nula de la clave AES (mismo contrato 64 hex). */
export const isWeakPiiHashKeyHex = isWeakMfaEncryptionKeyHex;

/**
 * Schema Joi para PII_HASH_KEY: 64 hex + rechazo de entropía nula.
 * Sin bypass por NODE_ENV — producción y lab fallan igual ante placeholder.
 */
export const piiHashKeyJoiSchema = Joi.string()
  .pattern(/^[0-9a-fA-F]{64}$/u)
  .required()
  .custom((value: string, helpers) => {
    if (isWeakPiiHashKeyHex(value)) {
      return helpers.error('piiHashKey.weak');
    }
    return value;
  })
  .messages({
    'string.pattern.base':
      'PII_HASH_KEY debe ser exactamente 64 caracteres hexadecimales ([0-9a-fA-F]).',
    'any.required':
      'PII_HASH_KEY es obligatoria: sin ella la API no puede calcular HMAC de documento/email/teléfono. Genera una con: openssl rand -hex 32',
    'piiHashKey.weak':
      'PII_HASH_KEY tiene entropía nula o es un placeholder (p. ej. todo ceros). Genera una con: openssl rand -hex 32',
  });

/**
 * Carga y valida PII_HASH_KEY desde env o un ConfigService-like.
 * Fail-fast con mensaje explícito (mismo espíritu que aes-gcm.util).
 */
export function resolvePiiHashKey(
  source:
    | NodeJS.ProcessEnv
    | { getOrThrow: (key: string) => string }
    | { get: (key: string) => string | undefined } = process.env,
): Buffer {
  let hex: string | undefined;

  if (typeof (source as { getOrThrow?: unknown }).getOrThrow === 'function') {
    try {
      hex = (source as { getOrThrow: (key: string) => string }).getOrThrow('PII_HASH_KEY');
    } catch {
      hex = undefined;
    }
  } else if (typeof (source as { get?: unknown }).get === 'function') {
    hex = (source as { get: (key: string) => string | undefined }).get('PII_HASH_KEY');
  } else {
    const raw = (source as NodeJS.ProcessEnv).PII_HASH_KEY;
    hex = typeof raw === 'string' ? raw : undefined;
  }

  if (!hex || typeof hex !== 'string' || hex.trim().length === 0) {
    throw new Error(
      'PII_HASH_KEY es requerida para HMAC de PII (documento/email/teléfono). ' +
        'Genera una con: openssl rand -hex 32',
    );
  }

  const trimmed = hex.trim();
  if (!/^[0-9a-fA-F]{64}$/u.test(trimmed)) {
    throw new Error('PII_HASH_KEY debe ser exactamente 64 caracteres hexadecimales ([0-9a-fA-F]).');
  }

  if (isWeakPiiHashKeyHex(trimmed)) {
    throw new Error(
      'PII_HASH_KEY tiene entropía nula o es un placeholder (p. ej. todo ceros). ' +
        'Genera una con: openssl rand -hex 32',
    );
  }

  return Buffer.from(trimmed, 'hex');
}

/** HMAC-SHA-256 hex (64 chars) con la clave de búsqueda PII. */
export function hmacPii(value: string, key: Buffer): string {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest('hex');
}
