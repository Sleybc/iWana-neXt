import {
  decryptAes256Gcm,
  encryptAes256Gcm,
  isWeakMfaEncryptionKeyHex,
  loadPiiAesGcmKeyPair,
  mfaEncryptionKeyJoiSchema,
  mfaEncryptionKeyPreviousJoiSchema,
  parseEncryptionKeyHex,
  piiEncryptionKeyJoiSchema,
  piiEncryptionKeyPreviousJoiSchema,
} from './aes-gcm.util';
import { Logger } from '@nestjs/common';

/** Clave de prueba con entropía no nula (no es secreto real). */
const ACTIVE_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const PREVIOUS_HEX = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

/**
 * R-9 — vector de frontera como dato (no import cruzado).
 * Mismo literal embebido en packages/database util.spec; generado una vez con
 * esta utilidad (AES-256-GCM, iv:tag:ciphertext hex) bajo ACTIVE_HEX.
 */
const R9_PLAINTEXT = '900123456';
const R9_CIPHERTEXT_LITERAL =
  'd55c0fcd467d2a23bfb48839:d3e049c6d77ae2d4357a83ce94d28e8f:27e5a87c5c2fbfb966';

describe('aes-gcm.util (SEC-02)', () => {
  describe('loadPiiAesGcmKeyPair (ADR-058 fase 2)', () => {
    const mfaActive = parseEncryptionKeyHex(ACTIVE_HEX);
    const mfaPrevious = parseEncryptionKeyHex(PREVIOUS_HEX);
    const piiActiveHex = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
    const piiPreviousHex = '8899aabbccddeeff00112233445566778899aabbccddeeff0011223344556677';

    it('en no producción usa MFA solo como fallback y avisa una vez sin incluir claves', () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const config = {
        get: jest.fn((key: string) => (key === 'NODE_ENV' ? 'development' : undefined)),
        getOrThrow: jest.fn((key: string) => {
          if (key === 'MFA_ENCRYPTION_KEY') return ACTIVE_HEX;
          throw new Error('missing-config');
        }),
      };

      const first = loadPiiAesGcmKeyPair(config);
      const second = loadPiiAesGcmKeyPair(config);

      expect(first.activeKey).toEqual(mfaActive);
      expect(first.previousKey).toEqual([]);
      expect(second.activeKey).toEqual(mfaActive);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).not.toContain(ACTIVE_HEX);
      warn.mockRestore();
    });

    it('usa PII activa para escritura y prueba PII previa antes de MFA legado', () => {
      const piiPrevious = parseEncryptionKeyHex(piiPreviousHex);
      const legacy = encryptAes256Gcm('dato-sintetico', piiPrevious);
      const config = {
        get: jest.fn((key: string) => {
          const values: Record<string, string> = {
            NODE_ENV: 'production',
            PII_ENCRYPTION_KEY: piiActiveHex,
            PII_ENCRYPTION_KEY_PREVIOUS: piiPreviousHex,
            MFA_ENCRYPTION_KEY_PREVIOUS: PREVIOUS_HEX,
            PII_DECRYPT_LEGACY_MFA: 'true',
          };
          return values[key];
        }),
        getOrThrow: jest.fn((key: string) => {
          if (key === 'MFA_ENCRYPTION_KEY') return ACTIVE_HEX;
          throw new Error('missing-config');
        }),
      };
      const keys = loadPiiAesGcmKeyPair(config);

      expect(keys.activeKey).toEqual(parseEncryptionKeyHex(piiActiveHex));
      expect(decryptAes256Gcm(legacy, keys.activeKey, keys.previousKey)).toBe('dato-sintetico');
      expect(keys.previousKey).toEqual([piiPrevious, mfaActive, mfaPrevious]);
    });

    it('lee claves MFA legadas solo cuando PII_DECRYPT_LEGACY_MFA está habilitada', () => {
      const legacy = encryptAes256Gcm('dato-sintetico', mfaPrevious);
      const configFor = (enabled: boolean) => ({
        get: jest.fn((key: string) => {
          const values: Record<string, string> = {
            NODE_ENV: 'production',
            PII_ENCRYPTION_KEY: piiActiveHex,
            MFA_ENCRYPTION_KEY_PREVIOUS: PREVIOUS_HEX,
            PII_DECRYPT_LEGACY_MFA: String(enabled),
          };
          return values[key];
        }),
        getOrThrow: jest.fn((key: string) => {
          if (key === 'MFA_ENCRYPTION_KEY') return ACTIVE_HEX;
          throw new Error('missing-config');
        }),
      });

      const enabledKeys = loadPiiAesGcmKeyPair(configFor(true));
      expect(decryptAes256Gcm(legacy, enabledKeys.activeKey, enabledKeys.previousKey)).toBe(
        'dato-sintetico',
      );

      const disabledKeys = loadPiiAesGcmKeyPair(configFor(false));
      expect(() =>
        decryptAes256Gcm(legacy, disabledKeys.activeKey, disabledKeys.previousKey),
      ).toThrow();
    });

    it('falla cerrado en producción si falta la clave PII o es igual a la clave MFA', () => {
      const configFor = (piiKey?: string) => ({
        get: jest.fn((key: string) =>
          key === 'NODE_ENV' ? 'production' : key === 'PII_ENCRYPTION_KEY' ? piiKey : undefined,
        ),
        getOrThrow: jest.fn((key: string) => {
          if (key === 'MFA_ENCRYPTION_KEY') return ACTIVE_HEX;
          throw new Error('missing-config');
        }),
      });

      expect(() => loadPiiAesGcmKeyPair(configFor())).toThrow(/PII_ENCRYPTION_KEY/);
      expect(() => loadPiiAesGcmKeyPair(configFor(ACTIVE_HEX))).toThrow(/PII_ENCRYPTION_KEY/);
    });
  });

  describe('R-9: vector ciphertext literal (frontera formato)', () => {
    it('descifra el literal embebido al plaintext esperado con la util de la API', () => {
      const activeKey = parseEncryptionKeyHex(ACTIVE_HEX);
      expect(decryptAes256Gcm(R9_CIPHERTEXT_LITERAL, activeKey, null)).toBe(R9_PLAINTEXT);
    });
  });

  describe('isWeakMfaEncryptionKeyHex', () => {
    it('rechaza all-zero, all-f y un solo nibble repetido', () => {
      expect(isWeakMfaEncryptionKeyHex('0'.repeat(64))).toBe(true);
      expect(isWeakMfaEncryptionKeyHex('f'.repeat(64))).toBe(true);
      expect(isWeakMfaEncryptionKeyHex('F'.repeat(64))).toBe(true);
      expect(isWeakMfaEncryptionKeyHex('a'.repeat(64))).toBe(true);
      expect(isWeakMfaEncryptionKeyHex('A'.repeat(64))).toBe(true);
      expect(isWeakMfaEncryptionKeyHex('1'.repeat(64))).toBe(true);
    });

    it('acepta una clave hex de entropía razonable', () => {
      expect(isWeakMfaEncryptionKeyHex(ACTIVE_HEX)).toBe(false);
      expect(isWeakMfaEncryptionKeyHex(PREVIOUS_HEX)).toBe(false);
    });
  });

  describe('mfaEncryptionKeyJoiSchema', () => {
    it('acepta 64 hex validos', () => {
      const { error, value } = mfaEncryptionKeyJoiSchema.validate(ACTIVE_HEX);
      expect(error).toBeUndefined();
      expect(value).toBe(ACTIVE_HEX);
    });

    it('rechaza longitud incorrecta, no-hex y entropia nula', () => {
      expect(mfaEncryptionKeyJoiSchema.validate('0'.repeat(63)).error).toBeDefined();
      expect(mfaEncryptionKeyJoiSchema.validate('g'.repeat(64)).error).toBeDefined();
      expect(mfaEncryptionKeyJoiSchema.validate('0'.repeat(64)).error).toBeDefined();
      expect(mfaEncryptionKeyJoiSchema.validate('f'.repeat(64)).error).toBeDefined();
      expect(mfaEncryptionKeyJoiSchema.validate('a'.repeat(64)).error).toBeDefined();
    });
  });

  describe('mfaEncryptionKeyPreviousJoiSchema', () => {
    it('permite ausente o vacio', () => {
      expect(mfaEncryptionKeyPreviousJoiSchema.validate(undefined).error).toBeUndefined();
      expect(mfaEncryptionKeyPreviousJoiSchema.validate('').error).toBeUndefined();
    });

    it('acepta 64 hex incluso si es debil (rotacion desde clave comprometida)', () => {
      expect(mfaEncryptionKeyPreviousJoiSchema.validate(PREVIOUS_HEX).error).toBeUndefined();
      expect(mfaEncryptionKeyPreviousJoiSchema.validate('0'.repeat(64)).error).toBeUndefined();
      expect(mfaEncryptionKeyPreviousJoiSchema.validate('g'.repeat(64)).error).toBeDefined();
    });
  });

  describe('PII encryption key schemas', () => {
    it('aplica a clave PII activa la validación de 64 hex y entropía no nula', () => {
      expect(piiEncryptionKeyJoiSchema.validate(ACTIVE_HEX).error).toBeUndefined();
      expect(piiEncryptionKeyJoiSchema.validate('0'.repeat(64)).error).toBeDefined();
      expect(piiEncryptionKeyJoiSchema.validate('g'.repeat(64)).error).toBeDefined();
    });

    it('permite PII previa ausente o débil durante la rotación, con formato hexadecimal', () => {
      expect(piiEncryptionKeyPreviousJoiSchema.validate('').error).toBeUndefined();
      expect(piiEncryptionKeyPreviousJoiSchema.validate('0'.repeat(64)).error).toBeUndefined();
      expect(piiEncryptionKeyPreviousJoiSchema.validate('g'.repeat(64)).error).toBeDefined();
    });
  });

  describe('encrypt/decrypt con previous', () => {
    const activeKey = parseEncryptionKeyHex(ACTIVE_HEX);
    const previousKey = parseEncryptionKeyHex(PREVIOUS_HEX);

    it('cifra con activa y descifra con activa', () => {
      const cipher = encryptAes256Gcm('secreto-test', activeKey);
      expect(decryptAes256Gcm(cipher, activeKey)).toBe('secreto-test');
    });

    it('descifra ciphertext legado con PREVIOUS cuando falla la activa', () => {
      const legacy = encryptAes256Gcm('legado-mfa', previousKey);
      expect(decryptAes256Gcm(legacy, activeKey, previousKey)).toBe('legado-mfa');
    });

    it('no usa previous si la activa ya descifra', () => {
      const current = encryptAes256Gcm('actual', activeKey);
      expect(decryptAes256Gcm(current, activeKey, previousKey)).toBe('actual');
    });

    it('lanza si ninguna clave descifra', () => {
      const other = parseEncryptionKeyHex(
        'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
      );
      const cipher = encryptAes256Gcm('x', other);
      expect(() => decryptAes256Gcm(cipher, activeKey, previousKey)).toThrow();
    });
  });
});
