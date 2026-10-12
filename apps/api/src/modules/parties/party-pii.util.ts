import { BadRequestException } from '@nestjs/common';
import { DocumentTypeParty, PartyContactType, normalizeDocumentNumber } from '@iwana/shared';
import { ConfigService } from '@nestjs/config';
import {
  decryptAes256Gcm,
  encryptAes256Gcm,
  loadAesGcmKeyPair,
} from '../../common/crypto/aes-gcm.util';
import { hmacPii, resolvePiiHashKey } from '../../common/crypto/pii-hash-key.util';

const LEGACY_CONTACT_VALUE = '';

export interface PartyPiiCrypto {
  encrypt(value: string): string;
  decrypt(value: string): string;
  documentHmac(documentType: DocumentTypeParty, value: string): string;
  contactHmac(type: PartyContactType, value: string): string;
}

export function createPartyPiiCrypto(config: ConfigService): PartyPiiCrypto {
  const { activeKey, previousKey } = loadAesGcmKeyPair(config);
  const hashKey = resolvePiiHashKey(config);

  return {
    encrypt: (value) => {
      // iv + tag + hex ciphertext must fit C-DDL-1's varchar(500).
      if (Buffer.byteLength(value, 'utf8') > 221) {
        throw new BadRequestException('El dato excede la longitud cifrable permitida.');
      }
      return encryptAes256Gcm(value, activeKey);
    },
    decrypt: (value) => decryptAes256Gcm(value, activeKey, previousKey),
    documentHmac: (documentType, value) => {
      const normalized = normalizeDocumentNumber(documentType, value);
      if (!normalized) throw new BadRequestException('El documento no tiene un formato válido.');
      return hmacPii(normalized, hashKey);
    },
    contactHmac: (type, value) => {
      const normalized =
        type === PartyContactType.EMAIL ? value.toLowerCase().trim() : value.trim();
      if (!normalized) throw new BadRequestException('El contacto no tiene un formato válido.');
      return hmacPii(normalized, hashKey);
    },
  };
}

export function partyContactStorageValue(): string {
  // C-DDL-1 conserva `party_contact.value NOT NULL` hasta E-3; no guardar allí PII.
  return LEGACY_CONTACT_VALUE;
}
