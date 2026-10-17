import {
  RUT_RESPONSIBILITIES,
  type RutResponsibility,
  SUBSCRIBER_FISCAL_DATA_INCOMPLETE,
  SUBSCRIBER_FISCAL_MISSING_FIELDS,
  type SubscriberFiscalMissingField,
  VatResponsibility,
} from '@iwana/shared';
import { ApiError } from '@/lib/api-client';

export const FISCAL_DATA_INCOMPLETE_TITLE = 'Faltan datos fiscales para activar o contratar';

export const VAT_RESPONSIBILITY_LABELS: Record<VatResponsibility, string> = {
  [VatResponsibility.RESPONSABLE]: 'Responsable',
  [VatResponsibility.NO_RESPONSABLE]: 'No responsable',
};

export const VAT_RESPONSIBILITY_OPTIONS = Object.values(VatResponsibility).map((value) => ({
  value,
  title: VAT_RESPONSIBILITY_LABELS[value],
}));

export const RUT_RESPONSIBILITY_LABELS: Record<RutResponsibility, string> = {
  'O-13': 'Gran contribuyente',
  'O-15': 'Autorretenedor',
  'O-23': 'Agente de retención de IVA',
  'O-47': 'Régimen simple de tributación',
  'R-99-PN': 'No aplica, otros',
};

export const RUT_RESPONSIBILITY_OPTIONS = RUT_RESPONSIBILITIES.map((code) => ({
  code,
  label: RUT_RESPONSIBILITY_LABELS[code],
}));

export const FISCAL_MISSING_FIELD_LABELS: Record<SubscriberFiscalMissingField, string> = {
  VAT_RESPONSIBILITY: 'Responsabilidad de IVA',
  RUT_RESPONSIBILITIES: 'Responsabilidades del RUT',
  NIT_VERIFICATION_DIGIT: 'Dígito de verificación del NIT',
  LEGAL_REPRESENTATIVE: 'Representante legal',
};

export function formatVatResponsibility(value: VatResponsibility | null | undefined): string {
  return value ? VAT_RESPONSIBILITY_LABELS[value] : 'Pendiente de completar';
}

// Espejo de `calculateNitVerificationDigit` de la API (apps/api/src/common/crypto):
// mismos pesos DIAN y mismo límite de 15 dígitos. Si la API cambia, este espejo cambia con ella.
const NIT_WEIGHTS_FROM_RIGHT = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

export function calculateNitVerificationDigit(nit: string): string | null {
  const digits = nit.replace(/\D/gu, '');
  if (digits.length === 0 || digits.length > NIT_WEIGHTS_FROM_RIGHT.length) return null;

  const weightedSum = [...digits]
    .reverse()
    .reduce((sum, digit, index) => sum + Number(digit) * NIT_WEIGHTS_FROM_RIGHT[index]!, 0);
  const remainder = weightedSum % 11;
  return String(remainder < 2 ? remainder : 11 - remainder);
}

/**
 * Valida el dígito de verificación con la misma regla que la API.
 * Devuelve el mensaje de error visible o `null` si el dígito es válido.
 */
export function validateNitVerificationDigit(nit: string, digit: string): string | null {
  const normalizedDigit = digit.trim();
  if (!normalizedDigit) return 'Ingresa el dígito de verificación del NIT.';
  if (!/^\d$/u.test(normalizedDigit)) return 'El dígito de verificación debe ser un número.';
  const expected = calculateNitVerificationDigit(nit);
  if (expected === null) return 'Revisa el NIT antes de validar el dígito de verificación.';
  if (expected !== normalizedDigit) return 'El dígito de verificación no coincide con el NIT.';
  return null;
}

/**
 * Lee un rechazo 422 `SUBSCRIBER_FISCAL_DATA_INCOMPLETE` sin exponer el mensaje técnico.
 * Devuelve los campos faltantes conocidos, o `null` si el error es de otro tipo.
 */
export function readFiscalDataIncompleteError(
  error: unknown,
): SubscriberFiscalMissingField[] | null {
  if (
    !(error instanceof ApiError) ||
    error.status !== 422 ||
    error.code !== SUBSCRIBER_FISCAL_DATA_INCOMPLETE
  ) {
    return null;
  }

  const details = error.details;
  const rawMissing =
    details && typeof details === 'object' && 'missing' in details
      ? (details as { missing?: unknown }).missing
      : undefined;
  if (!Array.isArray(rawMissing)) return [];

  return SUBSCRIBER_FISCAL_MISSING_FIELDS.filter((field) => rawMissing.includes(field));
}
