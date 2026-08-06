import { createHmac } from 'crypto';
import { hashDocumentNumber } from './hash-document.util';
import { resolvePiiHashKey } from './pii-hash-key.util';

/** Clave sintética de laboratorio (entropía no nula). */
const TEST_PII_HASH_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('hashDocumentNumber', () => {
  const previous = process.env.PII_HASH_KEY;

  beforeAll(() => {
    process.env.PII_HASH_KEY = TEST_PII_HASH_KEY;
  });

  afterAll(() => {
    if (previous === undefined) {
      delete process.env.PII_HASH_KEY;
    } else {
      process.env.PII_HASH_KEY = previous;
    }
  });

  it('produce hex HMAC-SHA-256 determinista de 64 caracteres', () => {
    const key = resolvePiiHashKey();
    const digest = hashDocumentNumber('900123456');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe(createHmac('sha256', key).update('900123456', 'utf8').digest('hex'));
    expect(hashDocumentNumber('900123456')).toBe(digest);
  });

  it('no normaliza casing (paridad con subscribers)', () => {
    expect(hashDocumentNumber('AB12')).not.toBe(hashDocumentNumber('ab12'));
  });

  it('sin clave, falla de forma explícita', () => {
    const saved = process.env.PII_HASH_KEY;
    delete process.env.PII_HASH_KEY;
    expect(() => hashDocumentNumber('900123456')).toThrow(/PII_HASH_KEY/);
    process.env.PII_HASH_KEY = saved;
  });
});
