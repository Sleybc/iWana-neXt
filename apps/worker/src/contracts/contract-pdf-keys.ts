import { createDecipheriv } from 'node:crypto';

/**
 * Claves AES-256-GCM del worker para el contrato (ADR-109 D5): misma política que la API
 * (`loadPiiAesGcmKeyPair`): PII_ENCRYPTION_KEY obligatoria en producción; fuera de ella cae a
 * MFA_ENCRYPTION_KEY. Cifra con la activa; descifra con la activa y las anteriores.
 */
export interface ContractPdfKeys {
  activeKey: Buffer;
  readKeys: Buffer[];
}

const HEX_KEY = /^[0-9a-fA-F]{64}$/u;

function read(env: (key: string) => unknown, key: string): string {
  const value = env(key);
  return typeof value === 'string' ? value.trim() : '';
}

export function loadContractPdfKeys(env: (key: string) => unknown): ContractPdfKeys {
  const production = read(env, 'NODE_ENV') === 'production';
  const pii = read(env, 'PII_ENCRYPTION_KEY');
  const mfa = read(env, 'MFA_ENCRYPTION_KEY');
  const activeHex = pii || (production ? '' : mfa);
  if (!HEX_KEY.test(activeHex)) {
    throw new Error('PII_ENCRYPTION_KEY (64 hex) es obligatoria para generar contratos.');
  }
  const candidates = [
    activeHex,
    read(env, 'PII_ENCRYPTION_KEY_PREVIOUS'),
    ...(production ? [] : [mfa, read(env, 'MFA_ENCRYPTION_KEY_PREVIOUS')]),
  ].filter((value) => HEX_KEY.test(value));
  const readKeys: Buffer[] = [];
  for (const hex of candidates) {
    const key = Buffer.from(hex, 'hex');
    if (!readKeys.some((existing) => existing.equals(key))) readKeys.push(key);
  }
  return { activeKey: Buffer.from(activeHex, 'hex'), readKeys };
}

/** Descifra el formato texto de la API `iv:tag:ciphertext` (hex). */
export function decryptAesGcmText(encrypted: string, keys: readonly Buffer[]): string {
  const parts = encrypted.split(':');
  if (parts.length !== 3) throw new Error('Snapshot cifrado con formato inválido.');
  const [ivHex, tagHex, dataHex] = parts as [string, string, string];
  let lastError: unknown = new Error('Sin claves para descifrar el snapshot.');
  for (const key of keys) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      return Buffer.concat([
        decipher.update(Buffer.from(dataHex, 'hex')),
        decipher.final(),
      ]).toString('utf8');
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
