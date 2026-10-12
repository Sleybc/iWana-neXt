import { DocumentTypeParty } from '../enums/parties/document-type-party.enum';

/**
 * Canonical form for document-number HMACs shared by CRM and Parties.
 *
 * Colombian numeric document types retain digits only. Passport-like types
 * retain ASCII letters and numbers in uppercase; separators and whitespace
 * are removed. Unsupported document types fail closed instead of silently
 * producing an incompatible HMAC.
 */
export function normalizeDocumentNumber(type: DocumentTypeParty, raw: string): string {
  const documentType = String(type);
  const value = raw;

  switch (documentType) {
    case 'CC':
    case 'CE':
    case 'NIT':
    case 'TI':
      return value.replace(/\D/gu, '');
    case 'PASAPORTE':
    case 'PEP':
    case 'PTP':
      return value.toUpperCase().replace(/[^A-Z0-9]/gu, '');
    default:
      throw new Error(`Tipo de documento no soportado para normalización: ${documentType}`);
  }
}
