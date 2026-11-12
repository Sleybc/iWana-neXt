import { z } from 'zod';

const BILLING_MONEY_MAX = 999_999_999_999.99;
const BILLING_MONEY_STRING_PATTERN = /^\d{1,12}(\.\d{1,2})?$/u;
const MAX_DECIMAL_ERROR = 'El monto admite hasta dos decimales.';

/** Entrada monetaria compatible con numeric(14,2); permite cero para umbrales de política. */
export function billingMoneyInputSchema(allowZero = false) {
  const numberBase = z.number().finite().max(BILLING_MONEY_MAX);
  const numberSchema = allowZero ? numberBase.nonnegative() : numberBase.positive();
  const stringSchema = z
    .string()
    .regex(BILLING_MONEY_STRING_PATTERN)
    .refine((value) => (allowZero ? Number(value) >= 0 : Number(value) > 0));

  return z.union([
    numberSchema.refine((value) => Number(value.toFixed(2)) === value, MAX_DECIMAL_ERROR),
    stringSchema,
  ]);
}

/** Representación decimal serializada compatible con numeric(14,2). */
export const billingMoneyStringSchema = z
  .string()
  .regex(BILLING_MONEY_STRING_PATTERN)
  .refine((value) => Number(value) <= BILLING_MONEY_MAX);

/**
 * Monto con signo compatible con numeric(14,2). Solo lo usa la línea `CORTESIA` de un
 * borrador (spec MOD14 2026-11-12 R4), que resta del documento.
 */
export const billingSignedMoneyStringSchema = z
  .string()
  .regex(/^-?\d{1,12}(\.\d{1,2})?$/u)
  .refine((value) => Math.abs(Number(value)) <= BILLING_MONEY_MAX);
