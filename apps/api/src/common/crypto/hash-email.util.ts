import { hmacPii, resolvePiiHashKey } from './pii-hash-key.util';

/**
 * HMAC-SHA-256 del email normalizado (minúsculas + trim).
 * Derivado de búsqueda/compatibilidad; no sustituye el email en texto plano.
 * Requiere `PII_HASH_KEY` (SEC-P1).
 * Semántica alineada con `@iwana/db` `hmacEmail` / `scripts/lib/pii-hmac.mjs`.
 */
export function hashEmail(email: string, key?: Buffer): string {
  return hmacPii(email.toLowerCase().trim(), key ?? resolvePiiHashKey());
}
