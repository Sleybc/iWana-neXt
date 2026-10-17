import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hmacPiiValue } from '@iwana/db';
import { DocumentTypeParty, normalizeDocumentNumber } from '@iwana/shared';
import { decryptAes256Gcm, encryptAes256Gcm, loadPiiAesGcmKeyPair } from './aes-gcm.util';
import { resolvePiiHashKey } from './pii-hash-key.util';

export interface FiscalDocumentCryptoKeys {
  activeEncryptionKey: Buffer;
  previousEncryptionKeys: Buffer | readonly Buffer[] | null;
  hashKey: Buffer;
}

export interface EncryptedFiscalDocument {
  encrypted: string;
  hmac: string;
}

export interface FiscalDocumentCrypto {
  encrypt(value: string | null | undefined): EncryptedFiscalDocument | null;
  decrypt(encrypted: string): string;
}

export interface FiscalDocumentStorageTarget {
  fiscalDocument: string | null;
  fiscalDocumentEncrypted?: string | null;
  fiscalDocumentHmac?: string | null;
}

export function createFiscalDocumentCrypto(config: ConfigService): FiscalDocumentCrypto {
  let crypto: FiscalDocumentCrypto | undefined;
  const getCrypto = (): FiscalDocumentCrypto => {
    if (!crypto) {
      const { activeKey, previousKey } = loadPiiAesGcmKeyPair(config);
      crypto = createFiscalDocumentCryptoFromKeys({
        activeEncryptionKey: activeKey,
        previousEncryptionKeys: previousKey,
        hashKey: resolvePiiHashKey(config),
      });
    }
    return crypto;
  };

  return {
    encrypt(value) {
      if (value == null) return null;
      return getCrypto().encrypt(value);
    },
    decrypt(encrypted) {
      return getCrypto().decrypt(encrypted);
    },
  };
}

export function createFiscalDocumentCryptoFromKeys(
  keys: FiscalDocumentCryptoKeys,
): FiscalDocumentCrypto {
  return {
    encrypt(value) {
      if (value == null) return null;
      const normalized = normalizeDocumentNumber(DocumentTypeParty.OTHER, value);
      if (!normalized) {
        throw new BadRequestException('El documento fiscal no tiene un formato válido.');
      }
      return {
        encrypted: encryptAes256Gcm(value, keys.activeEncryptionKey),
        hmac: hmacPiiValue(normalized, keys.hashKey),
      };
    },
    decrypt(encrypted) {
      return decryptAes256Gcm(encrypted, keys.activeEncryptionKey, keys.previousEncryptionKeys);
    },
  };
}

/** Guarda los valores nuevos como propiedades no enumerables para no serializar cifrado ni HMAC. */
export function setFiscalDocumentStorage(
  target: FiscalDocumentStorageTarget,
  value: string | null | undefined,
  crypto: FiscalDocumentCrypto,
): void {
  const stored = crypto.encrypt(value);
  target.fiscalDocument = null;
  Object.defineProperties(target, {
    fiscalDocumentEncrypted: {
      configurable: true,
      enumerable: false,
      value: stored?.encrypted ?? null,
      writable: true,
    },
    fiscalDocumentHmac: {
      configurable: true,
      enumerable: false,
      value: stored?.hmac ?? null,
      writable: true,
    },
  });
}

/** Hidrata la respuesta con el valor descifrado o conserva la lectura heredada en texto plano. */
export function hydrateFiscalDocument(
  target: FiscalDocumentStorageTarget,
  encrypted: string | null,
  hmac: string | null,
  legacyPlaintext: string | null,
  crypto: FiscalDocumentCrypto,
): string | null {
  Object.defineProperties(target, {
    fiscalDocumentEncrypted: {
      configurable: true,
      enumerable: false,
      value: encrypted,
      writable: true,
    },
    fiscalDocumentHmac: {
      configurable: true,
      enumerable: false,
      value: hmac,
      writable: true,
    },
  });
  const value = resolveFiscalDocumentValue(encrypted, legacyPlaintext, crypto);
  target.fiscalDocument = value;
  return value;
}

export function resolveFiscalDocumentValue(
  encrypted: string | null,
  legacyPlaintext: string | null,
  crypto: FiscalDocumentCrypto,
): string | null {
  return encrypted ? crypto.decrypt(encrypted) : legacyPlaintext;
}

/** Prevents a hydrated encrypted value from being written back to the legacy plaintext column. */
export function prepareFiscalDocumentForSave(target: FiscalDocumentStorageTarget): void {
  if (target.fiscalDocumentEncrypted) target.fiscalDocument = null;
}
