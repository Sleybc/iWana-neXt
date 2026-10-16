import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentTypeParty, PartyContactType } from '@iwana/shared';
import { encryptAes256Gcm, parseEncryptionKeyHex } from '../../common/crypto/aes-gcm.util';
import { createPartyPiiCrypto, partyContactStorageValue } from './party-pii.util';

const ACTIVE_KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const PREVIOUS_KEY_HEX = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
const HASH_KEY_HEX = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

function makeConfig(previousKey?: string): ConfigService {
  return {
    getOrThrow: (key: string) => (key === 'PII_HASH_KEY' ? HASH_KEY_HEX : ACTIVE_KEY_HEX),
    get: (key: string) => {
      if (key === 'PII_ENCRYPTION_KEY') return ACTIVE_KEY_HEX;
      if (key === 'PII_ENCRYPTION_KEY_PREVIOUS') return previousKey;
      if (key === 'PII_DECRYPT_LEGACY_MFA') return false;
      return undefined;
    },
  } as unknown as ConfigService;
}

describe('createPartyPiiCrypto', () => {
  it('cifra con la clave activa y descifra valores legados con la clave anterior', () => {
    const crypto = createPartyPiiCrypto(makeConfig(PREVIOUS_KEY_HEX));
    const previousCiphertext = encryptAes256Gcm(
      'documento sintético',
      parseEncryptionKeyHex(PREVIOUS_KEY_HEX),
    );

    const encrypted = crypto.encrypt('contacto sintético');

    expect(crypto.decrypt(encrypted)).toBe('contacto sintético');
    expect(crypto.decrypt(previousCiphertext)).toBe('documento sintético');
  });

  it('rechaza valores cifrados corruptos y valores que exceden el tamaño persistible', () => {
    const crypto = createPartyPiiCrypto(makeConfig());

    expect(() => crypto.decrypt('formato-corrupto')).toThrow('Formato de valor cifrado invalido');
    expect(() => crypto.encrypt('é'.repeat(111))).toThrow(BadRequestException);
  });

  it('usa el documento normalizado para HMAC y falla cerrado con un documento inválido', () => {
    const crypto = createPartyPiiCrypto(makeConfig());

    expect(crypto.documentHmac(DocumentTypeParty.CC, '123.456')).toBe(
      crypto.documentHmac(DocumentTypeParty.CC, '123456'),
    );
    expect(() => crypto.documentHmac(DocumentTypeParty.CC, '---')).toThrow(BadRequestException);
  });

  it('normaliza email y espacios de contacto, y rechaza valores vacíos', () => {
    const crypto = createPartyPiiCrypto(makeConfig());

    expect(crypto.contactHmac(PartyContactType.EMAIL, '  USER@example.invalid  ')).toBe(
      crypto.contactHmac(PartyContactType.EMAIL, 'user@example.invalid'),
    );
    expect(crypto.contactHmac(PartyContactType.PHONE, '  3000000000  ')).toBe(
      crypto.contactHmac(PartyContactType.PHONE, '3000000000'),
    );
    expect(() => crypto.contactHmac(PartyContactType.EMAIL, '   ')).toThrow(BadRequestException);
  });

  it('persiste null en el valor de contacto en claro', () => {
    expect(partyContactStorageValue()).toBeNull();
  });
});
