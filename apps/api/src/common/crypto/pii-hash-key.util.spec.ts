import { piiHashKeyJoiSchema, resolvePiiHashKey } from './pii-hash-key.util';

/** Clave sintética de laboratorio (64 hex, entropía no nula). */
const VALID_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const ZERO_KEY = '0'.repeat(64);

describe('resolvePiiHashKey / piiHashKeyJoiSchema (SEC-P1 fail-fast)', () => {
  const previous = process.env.PII_HASH_KEY;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.PII_HASH_KEY;
    } else {
      process.env.PII_HASH_KEY = previous;
    }
  });

  it('acepta una clave hex de 64 chars con entropía no nula', () => {
    process.env.PII_HASH_KEY = VALID_KEY;
    const buf = resolvePiiHashKey();
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBe(32);
  });

  it('falla de forma explícita si falta PII_HASH_KEY', () => {
    delete process.env.PII_HASH_KEY;
    expect(() => resolvePiiHashKey()).toThrow(/PII_HASH_KEY/);
  });

  it('rechaza longitud o formato inválido', () => {
    process.env.PII_HASH_KEY = 'abc';
    expect(() => resolvePiiHashKey()).toThrow(/64 caracteres hexadecimales/);
  });

  it('rechaza entropía nula (todo ceros)', () => {
    process.env.PII_HASH_KEY = ZERO_KEY;
    expect(() => resolvePiiHashKey()).toThrow(/entropía nula/);
  });

  it('Joi rechaza placeholder de entropía nula en arranque', () => {
    const result = piiHashKeyJoiSchema.validate(ZERO_KEY);
    expect(result.error).toBeDefined();
    expect(result.error?.message).toMatch(/entropía nula|placeholder/i);
  });

  it('Joi acepta clave válida', () => {
    const result = piiHashKeyJoiSchema.validate(VALID_KEY);
    expect(result.error).toBeUndefined();
    expect(result.value).toBe(VALID_KEY);
  });
});
