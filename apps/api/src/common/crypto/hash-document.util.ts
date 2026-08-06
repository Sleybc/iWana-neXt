import { hmacPii, resolvePiiHashKey } from './pii-hash-key.util';

/**
 * HMAC-SHA-256 hex (64 chars) del número de documento en texto plano.
 * Misma semántica de normalización que subscribers (sin casing); el caller
 * decide trim. Requiere `PII_HASH_KEY` (SEC-P1) — no es SHA-256 enumerable.
 */
export function hashDocumentNumber(documentNumber: string, key?: Buffer): string {
  return hmacPii(documentNumber, key ?? resolvePiiHashKey());
}
