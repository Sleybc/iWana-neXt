import {
  decryptAes256Gcm,
  encryptAes256Gcm,
  isWeakMfaEncryptionKeyHex,
  mfaEncryptionKeyJoiSchema,
  mfaEncryptionKeyPreviousJoiSchema,
  parseEncryptionKeyHex,
} from './aes-gcm.util';

/** Clave de prueba con entropía no nula (no es secreto real). */
const ACTIVE_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const PREVIOUS_HEX = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

describe('aes-gcm.util (SEC-02)', () => {
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
