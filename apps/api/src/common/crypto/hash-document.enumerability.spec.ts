import { hashDocumentNumber } from './hash-document.util';

/**
 * E0 / S-1 — regresión permanente (SEC-P1 §5.9).
 *
 * Evidencia de ciclo:
 * 1) E0 original (SHA-256 sin clave): la enumeración **recuperaba** el valor.
 * 2) Tras E1 (HMAC-SHA-256 + PII_HASH_KEY): la misma enumeración **ya no**
 *    recupera el valor sin la clave.
 * 3) Este test queda invertido a assert negativo: sin clave, no hay recuperación.
 *
 * Datos sintéticos únicamente — sin PII real.
 */
describe('hashDocumentNumber — enumerabilidad offline (S-1)', () => {
  /** Rango inventado pequeño (100 valores), no corresponde a personas reales. */
  const SYNTHETIC_RANGE_START = 9_000_000_000;
  const SYNTHETIC_RANGE_END = 9_000_000_099;
  const TEST_PII_HASH_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

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

  function enumerateSyntheticDocumentSpace(): string[] {
    const values: string[] = [];
    for (let n = SYNTHETIC_RANGE_START; n <= SYNTHETIC_RANGE_END; n += 1) {
      values.push(String(n));
    }
    return values;
  }

  function recoverDocumentByOfflineEnumeration(storedHash: string): string | undefined {
    for (const candidate of enumerateSyntheticDocumentSpace()) {
      if (hashDocumentNumber(candidate) === storedHash) {
        return candidate;
      }
    }
    return undefined;
  }

  it('E0 pasó → falló tras HMAC → invertido: sin clave la enumeración no recupera', () => {
    const secretDocument = '9000000050';
    expect(Number(secretDocument)).toBeGreaterThanOrEqual(SYNTHETIC_RANGE_START);
    expect(Number(secretDocument)).toBeLessThanOrEqual(SYNTHETIC_RANGE_END);

    // Digest HMAC con clave (simula lectura de document_number_hmac).
    const leakedHash = hashDocumentNumber(secretDocument);

    // Ataque offline SIN la clave: el atacante solo puede probar SHA-256 crudo
    // (el defecto S-1) o HMAC con clave desconocida. Simulamos fuerza bruta
    // sobre el espacio con la primitiva actual: con HMAC+clave, recuperaría
    // solo si posee PII_HASH_KEY. Para el assert negativo de "sin clave",
    // comparamos contra digests SHA-256 crudos del espacio (ataque pre-E1).
    const { createHash } = require('crypto') as typeof import('crypto');
    let recoveredViaRawSha256: string | undefined;
    for (const candidate of enumerateSyntheticDocumentSpace()) {
      const raw = createHash('sha256').update(candidate, 'utf8').digest('hex');
      if (raw === leakedHash) {
        recoveredViaRawSha256 = candidate;
        break;
      }
    }

    expect(recoveredViaRawSha256).toBeUndefined();
    // Con la clave correcta sí es determinista (búsqueda legítima).
    expect(recoverDocumentByOfflineEnumeration(leakedHash)).toBe(secretDocument);
  });
});
