import { z } from 'zod';

export const legalTextTypeSchema = z.enum([
  'POLITICA_TRATAMIENTO',
  'AVISO_PRIVACIDAD',
  'AUTORIZACION',
]);

export const legalTextFormatSchema = z.enum(['PLAIN', 'MARKDOWN']);

export const createLegalTextSchema = z
  .object({
    type: legalTextTypeSchema,
    version: z.string().trim().min(1).max(32),
    content: z.string().min(1).max(200_000),
    format: legalTextFormatSchema.default('PLAIN'),
    url: z.string().url().nullable().optional(),
  })
  .strict();

export const legalTextSchema = z
  .object({
    id: z.string().uuid(),
    type: legalTextTypeSchema,
    version: z.string(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    content: z.string(),
    format: legalTextFormatSchema,
    publishedAt: z.string().datetime({ offset: true }),
    url: z.string().url().nullable(),
    isCurrent: z.boolean(),
  })
  .strict();

export const currentLegalTextQuerySchema = z.object({ type: legalTextTypeSchema }).strict();

export type LegalTextType = z.infer<typeof legalTextTypeSchema>;
export type LegalTextFormat = z.infer<typeof legalTextFormatSchema>;
export type CreateLegalText = z.infer<typeof createLegalTextSchema>;
export type LegalText = z.infer<typeof legalTextSchema>;
export type CurrentLegalTextQuery = z.infer<typeof currentLegalTextQuerySchema>;
