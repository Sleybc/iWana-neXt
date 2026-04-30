import { z } from 'zod';

export const optionalPhoneSchema = z
  .string()
  .max(50, 'Máximo 50 caracteres')
  .optional()
  .or(z.literal(''));

export const optionalUrlSchema = z
  .string()
  .url('URL inválida (incluye https://)')
  .optional()
  .or(z.literal(''));

export const optionalEconomicSectorSchema = z
  .string()
  .regex(/^\d{4,6}$/, 'Código CIIU debe tener entre 4 y 6 dígitos')
  .optional()
  .or(z.literal(''));

export const optionalNitSchema = z
  .string()
  .regex(/^\d{1,10}$/, 'NIT debe contener solo dígitos (máx. 10)')
  .optional()
  .or(z.literal(''));

export const optionalNitDvSchema = z
  .string()
  .regex(/^\d$/, 'Dígito verificador debe ser un único dígito')
  .optional()
  .or(z.literal(''));

export const optionalCompanyTypeSchema = z
  .enum(['SAS', 'LTDA', 'SA', 'PERSONA_NATURAL', 'COOPERATIVA', 'OTRO'])
  .optional()
  .or(z.literal(''));

export const optionalMaxSubscribersSchema = z.number().int().min(0).nullable().optional();

export function numberOrNull(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 55);
}

export function fieldError(message: string | undefined) {
  return message ? { error: message } : {};
}
