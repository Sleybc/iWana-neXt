import * as crypto from 'crypto';

/**
 * SHA-256 del email normalizado (minúsculas + trim).
 * Derivado de búsqueda/compatibilidad; no sustituye el email en texto plano.
 */
export function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}
