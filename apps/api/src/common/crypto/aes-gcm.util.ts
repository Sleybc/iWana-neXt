import * as crypto from 'crypto';
import * as Joi from 'joi';
import { Logger } from '@nestjs/common';

/** Formato en reposo: iv_hex:authTag_hex:ciphertext_hex (AES-256-GCM). */
const ENCRYPTED_PARTS = 3;

function isHexSegment(segment: string, expectedLength?: number): boolean {
  if (!segment || (expectedLength !== undefined && segment.length !== expectedLength)) {
    return false;
  }

  return /^[0-9a-f]+$/i.test(segment) && segment.length % 2 === 0;
}

/**
 * Detecta valores en formato iv:tag:ciphertext (hex) sin intentar descifrar.
 * Usado por CLI de recifrado y decodificadores legacy.
 */
export function looksLikeEncryptedAesGcm(value: string): boolean {
  const parts = value.split(':');
  if (parts.length !== ENCRYPTED_PARTS) {
    return false;
  }

  const [iv, authTag, ciphertext] = parts;
  // IV 12 bytes → 24 hex; authTag 16 bytes → 32 hex; ciphertext variable
  return (
    isHexSegment(iv ?? '', 24) && isHexSegment(authTag ?? '', 32) && isHexSegment(ciphertext ?? '')
  );
}

/**
 * Detecta claves hex de 64 chars con entropía nula (placeholder / laboratorio).
 * No valida el patrón hex; eso lo hace Joi / assert antes.
 */
export function isWeakMfaEncryptionKeyHex(hex: string): boolean {
  if (hex.length !== 64) {
    return true;
  }

  const lower = hex.toLowerCase();
  if (lower === '0'.repeat(64) || lower === 'f'.repeat(64)) {
    return true;
  }

  // Un solo nibble hex repetido 64 veces (p. ej. aaaa… / 1111…)
  return /^(.)\1{63}$/u.test(lower);
}

/**
 * Schema Joi para MFA_ENCRYPTION_KEY: 64 hex + rechazo de entropía nula.
 * Sin bypass por NODE_ENV.
 */
export const mfaEncryptionKeyJoiSchema = Joi.string()
  .pattern(/^[0-9a-fA-F]{64}$/u)
  .required()
  .custom((value: string, helpers) => {
    if (isWeakMfaEncryptionKeyHex(value)) {
      return helpers.error('mfaEncryptionKey.weak');
    }
    return value;
  })
  .messages({
    'string.pattern.base':
      'MFA_ENCRYPTION_KEY debe ser exactamente 64 caracteres hexadecimales ([0-9a-fA-F]).',
    'mfaEncryptionKey.weak':
      'MFA_ENCRYPTION_KEY tiene entropía nula o es un placeholder (p. ej. todo ceros). Genera una con: openssl rand -hex 32',
  });

/**
 * Schema Joi opcional para MFA_ENCRYPTION_KEY_PREVIOUS.
 * Solo formato 64 hex: puede ser débil a propósito (clave comprometida en rotación SEC-02 / ADR-058).
 * La clave activa sigue rechazando entropía nula.
 */
export const mfaEncryptionKeyPreviousJoiSchema = Joi.string()
  .pattern(/^[0-9a-fA-F]{64}$/u)
  .optional()
  .allow(null, '')
  .custom((value: string | null | undefined) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    return value;
  })
  .messages({
    'string.pattern.base':
      'MFA_ENCRYPTION_KEY_PREVIOUS debe ser exactamente 64 caracteres hexadecimales ([0-9a-fA-F]).',
  });

/** Schema para la clave activa independiente que cifra PII (ADR-058 fase 2). */
export const piiEncryptionKeyJoiSchema = Joi.string()
  .pattern(/^[0-9a-fA-F]{64}$/u)
  .custom((value: string, helpers) => {
    if (isWeakMfaEncryptionKeyHex(value)) {
      return helpers.error('piiEncryptionKey.weak');
    }
    return value;
  })
  .messages({
    'string.pattern.base':
      'PII_ENCRYPTION_KEY debe ser exactamente 64 caracteres hexadecimales ([0-9a-fA-F]).',
    'piiEncryptionKey.weak':
      'PII_ENCRYPTION_KEY tiene entropía nula o es un placeholder. Genera una con: openssl rand -hex 32',
  });

/** Schema opcional para aceptar ciphertext previo durante una rotación PII. */
export const piiEncryptionKeyPreviousJoiSchema = Joi.string()
  .pattern(/^[0-9a-fA-F]{64}$/u)
  .optional()
  .allow(null, '')
  .custom((value: string | null | undefined) => {
    if (value === undefined || value === null || value === '') return undefined;
    return value;
  })
  .messages({
    'string.pattern.base':
      'PII_ENCRYPTION_KEY_PREVIOUS debe ser exactamente 64 caracteres hexadecimales ([0-9a-fA-F]).',
  });

export function parseEncryptionKeyHex(keyHex: string): Buffer {
  return Buffer.from(keyHex, 'hex');
}

/**
 * Carga clave activa y, si existe, previous desde ConfigService-like.
 */
export function loadAesGcmKeyPair(config: {
  getOrThrow: (key: string) => string;
  get?: (key: string) => string | undefined;
}): { activeKey: Buffer; previousKey: Buffer | null } {
  const activeHex = config.getOrThrow('MFA_ENCRYPTION_KEY');
  const previousHex = config.get?.('MFA_ENCRYPTION_KEY_PREVIOUS');
  const previousKey =
    typeof previousHex === 'string' && previousHex.length > 0
      ? parseEncryptionKeyHex(previousHex)
      : null;

  return {
    activeKey: parseEncryptionKeyHex(activeHex),
    previousKey,
  };
}

let piiFallbackWarningEmitted = false;

/**
 * Carga la clave activa de PII y el orden completo de claves de lectura.
 * El fallback a MFA existe solo para entornos no productivos; en producción,
 * la API debe fallar cerrada si falta la clave independiente o coincide con MFA.
 */
export function loadPiiAesGcmKeyPair(config: {
  getOrThrow: (key: string) => string;
  get?: (key: string) => unknown;
}): { activeKey: Buffer; previousKey: Buffer[] } {
  const nodeEnv = config.get?.('NODE_ENV');
  const isProduction = nodeEnv === 'production';
  const mfaActiveHex = config.getOrThrow('MFA_ENCRYPTION_KEY').trim();
  const piiValue = config.get?.('PII_ENCRYPTION_KEY');
  const piiActiveHex = typeof piiValue === 'string' ? piiValue.trim() : '';

  let activeHex = piiActiveHex;
  if (!activeHex) {
    if (isProduction) {
      throw new Error('PII_ENCRYPTION_KEY es obligatoria en producción.');
    }
    activeHex = mfaActiveHex;
    if (!piiFallbackWarningEmitted) {
      piiFallbackWarningEmitted = true;
      new Logger('PiiAesGcmKeyPair').warn(
        'PII_ENCRYPTION_KEY no está definida; se usa MFA_ENCRYPTION_KEY como fallback no productivo.',
      );
    }
  }

  if (!/^[0-9a-fA-F]{64}$/u.test(activeHex) || isWeakMfaEncryptionKeyHex(activeHex)) {
    throw new Error('PII_ENCRYPTION_KEY debe ser una clave hex válida de 32 bytes con entropía.');
  }
  if (isProduction && activeHex.toLowerCase() === mfaActiveHex.toLowerCase()) {
    throw new Error('PII_ENCRYPTION_KEY debe ser distinta de MFA_ENCRYPTION_KEY en producción.');
  }

  const rawPiiPrevious = config.get?.('PII_ENCRYPTION_KEY_PREVIOUS');
  const piiPreviousHex = typeof rawPiiPrevious === 'string' ? rawPiiPrevious.trim() : '';
  const rawMfaPrevious = config.get?.('MFA_ENCRYPTION_KEY_PREVIOUS');
  const mfaPreviousHex = typeof rawMfaPrevious === 'string' ? rawMfaPrevious.trim() : '';
  for (const [name, value] of [
    ['PII_ENCRYPTION_KEY_PREVIOUS', piiPreviousHex],
    ['MFA_ENCRYPTION_KEY_PREVIOUS', mfaPreviousHex],
  ] as const) {
    if (value && !/^[0-9a-fA-F]{64}$/u.test(value)) {
      throw new Error(`${name} debe ser exactamente 64 caracteres hexadecimales.`);
    }
  }

  const legacyFlag = config.get?.('PII_DECRYPT_LEGACY_MFA');
  const allowLegacyMfa =
    legacyFlag === undefined ? true : legacyFlag === true || legacyFlag === 'true';
  const activeKey = parseEncryptionKeyHex(activeHex);
  const previousKeys: Buffer[] = [];
  const candidates = [
    piiPreviousHex,
    ...(allowLegacyMfa ? [mfaActiveHex, mfaPreviousHex] : []),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const key = parseEncryptionKeyHex(candidate);
    if (!key.equals(activeKey) && !previousKeys.some((previous) => previous.equals(key))) {
      previousKeys.push(key);
    }
  }

  return { activeKey, previousKey: previousKeys };
}

/** Cifra siempre con la clave activa. Formato: iv:tag:ciphertext (hex). */
export function encryptAes256Gcm(plaintext: string, activeKey: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', activeKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptWithKey(encrypted: string, key: Buffer): string {
  const parts = encrypted.split(':');
  if (parts.length !== ENCRYPTED_PARTS) {
    throw new Error('Formato de valor cifrado invalido. Se esperaba iv:authTag:ciphertext.');
  }

  const iv = Buffer.from(parts[0]!, 'hex');
  const authTag = Buffer.from(parts[1]!, 'hex');
  const ciphertext = Buffer.from(parts[2]!, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Descifra con clave activa; si falla la auth tag GCM y hay previous, reintenta.
 */
export function decryptAes256Gcm(
  encrypted: string,
  activeKey: Buffer,
  previousKey?: Buffer | readonly Buffer[] | null,
): string {
  try {
    return decryptWithKey(encrypted, activeKey);
  } catch (activeError) {
    const fallbackKeys = Array.isArray(previousKey)
      ? previousKey
      : previousKey
        ? [previousKey]
        : [];
    if (fallbackKeys.length === 0) {
      throw activeError;
    }

    for (const fallbackKey of fallbackKeys) {
      try {
        return decryptWithKey(encrypted, fallbackKey);
      } catch {
        // Continúa en orden; conserva el error de la clave activa al agotarlas.
      }
    }
    throw activeError;
  }
}
