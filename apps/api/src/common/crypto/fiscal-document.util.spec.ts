import { ConfigService } from '@nestjs/config';
import { DocumentTypeParty, normalizeDocumentNumber } from '@iwana/shared';
import { hmacPiiValue } from '@iwana/db';
import {
  createFiscalDocumentCrypto,
  resolveFiscalDocumentValue,
  setFiscalDocumentStorage,
} from './fiscal-document.util';

const ACTIVE_KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const HASH_KEY_HEX = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

function configService(): ConfigService {
  return {
    get: (key: string) => {
      if (key === 'PII_ENCRYPTION_KEY') return ACTIVE_KEY_HEX;
      if (key === 'PII_HASH_KEY') return HASH_KEY_HEX;
      if (key === 'NODE_ENV') return 'test';
      return undefined;
    },
    getOrThrow: (key: string) => {
      if (key === 'MFA_ENCRYPTION_KEY') return ACTIVE_KEY_HEX;
      if (key === 'PII_HASH_KEY') return HASH_KEY_HEX;
      throw new Error('Clave sintética no configurada.');
    },
  } as unknown as ConfigService;
}

describe('fiscal-document.util', () => {
  it('cifra el documento, calcula HMAC normalizado y lo recupera sin cambiar su valor', () => {
    const crypto = createFiscalDocumentCrypto(configService());
    const value = ' 90.000-123 ';

    const stored = crypto.encrypt(value);

    expect(stored?.encrypted).toBeDefined();
    expect(stored?.encrypted).not.toBe(value);
    expect(stored?.hmac).toBe(
      hmacPiiValue(
        normalizeDocumentNumber(DocumentTypeParty.OTHER, value),
        Buffer.from(HASH_KEY_HEX, 'hex'),
      ),
    );
    expect(crypto.decrypt(stored!.encrypted)).toBe(value);
  });

  it('usa texto plano heredado cuando no hay columna cifrada', () => {
    const crypto = createFiscalDocumentCrypto(configService());

    expect(resolveFiscalDocumentValue(null, 'legacy-document', crypto)).toBe('legacy-document');
  });

  it('prioriza el cifrado sobre el texto plano durante la expansión', () => {
    const crypto = createFiscalDocumentCrypto(configService());
    const stored = crypto.encrypt('encrypted-document');

    expect(resolveFiscalDocumentValue(stored?.encrypted ?? null, 'legacy-document', crypto)).toBe(
      'encrypted-document',
    );
  });

  it('conserva null sin generar ciphertext ni HMAC', () => {
    const crypto = createFiscalDocumentCrypto(configService());

    expect(crypto.encrypt(null)).toBeNull();
    expect(resolveFiscalDocumentValue(null, null, crypto)).toBeNull();
  });

  it('no expone ciphertext ni HMAC al serializar la entidad', () => {
    const crypto = createFiscalDocumentCrypto(configService());
    const entity = { fiscalDocument: null as string | null };

    setFiscalDocumentStorage(entity, 'synthetic-fiscal-document', crypto);

    expect(entity.fiscalDocument).toBeNull();
    expect(JSON.stringify(entity)).toBe('{"fiscalDocument":null}');
    expect(Reflect.get(entity, 'fiscalDocumentEncrypted')).toBeDefined();
    expect(Reflect.get(entity, 'fiscalDocumentHmac')).toBeDefined();
  });
});
