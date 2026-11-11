import { z } from 'zod';

export const legalTextTypeSchema = z.enum([
  'POLITICA_TRATAMIENTO',
  'AVISO_PRIVACIDAD',
  'AUTORIZACION',
  /** Plantilla del contrato único de servicios fijos (Res. CRC 5050 Anexo 2.3; ADR-109). */
  'CONTRATO_SERVICIO',
]);

/** HTML solo para la plantilla de contrato; el resto sigue en PLAIN o MARKDOWN. */
export const legalTextFormatSchema = z.enum(['PLAIN', 'MARKDOWN', 'HTML']);

/** Tipos que no se publican sin la declaración de aprobación jurídica (spec G2). */
export const LEGAL_TEXT_TYPES_REQUIRING_LEGAL_APPROVAL = ['CONTRATO_SERVICIO'] as const;

/** Declaración única que registra la publicación; sin nombre ni tarjeta del abogado (G2). */
export const LEGAL_APPROVAL_DECLARATION = 'APROBADO_POR_ASESORIA_JURIDICA' as const;
export const legalApprovalDeclarationSchema = z.literal(LEGAL_APPROVAL_DECLARATION);

/**
 * Aprobación registrada al publicar. `approvedByUserId` sale del JWT y `approvedAt` del
 * servidor; nunca del cuerpo de la petición.
 */
export const legalTextApprovalSchema = z
  .object({
    declaration: legalApprovalDeclarationSchema,
    approvedByUserId: z.string().uuid(),
    approvedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const createLegalTextSchema = z
  .object({
    type: legalTextTypeSchema,
    version: z.string().trim().min(1).max(32),
    content: z.string().min(1).max(200_000),
    format: legalTextFormatSchema.default('PLAIN'),
    url: z.string().url().nullable().optional(),
    legalApprovalDeclaration: legalApprovalDeclarationSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const isContract = value.type === 'CONTRATO_SERVICIO';
    if (isContract && value.legalApprovalDeclaration === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['legalApprovalDeclaration'],
        message: 'La plantilla de contrato solo se publica aprobada por asesoría jurídica.',
      });
    }
    if (isContract && value.format !== 'HTML') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['format'],
        message: 'La plantilla de contrato se publica en HTML.',
      });
    }
    if (!isContract && value.format === 'HTML') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['format'],
        message: 'HTML solo se admite en la plantilla de contrato.',
      });
    }
  });

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
    /** Presente en tipos que exigen aprobación jurídica; opcional mientras el bloque A la persiste. */
    legalApproval: legalTextApprovalSchema.nullable().optional(),
  })
  .strict();

export const currentLegalTextQuerySchema = z.object({ type: legalTextTypeSchema }).strict();

export type LegalTextType = z.infer<typeof legalTextTypeSchema>;
export type LegalTextFormat = z.infer<typeof legalTextFormatSchema>;
export type CreateLegalText = z.infer<typeof createLegalTextSchema>;
export type LegalText = z.infer<typeof legalTextSchema>;
export type CurrentLegalTextQuery = z.infer<typeof currentLegalTextQuerySchema>;
export type LegalTextApproval = z.infer<typeof legalTextApprovalSchema>;
