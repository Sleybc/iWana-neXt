import * as crypto from 'crypto';

/**
 * SHA-256 hex (64 chars) del número de documento en texto plano.
 * Misma semántica que el hash de `subscribers.document_number_hash` (migración 014):
 * sin normalizar casing; el caller decide trim/normalización de entrada.
 */
export function hashDocumentNumber(documentNumber: string): string {
  return crypto.createHash('sha256').update(documentNumber, 'utf8').digest('hex');
}
