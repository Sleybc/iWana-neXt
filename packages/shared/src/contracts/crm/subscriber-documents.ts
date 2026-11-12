import { z } from 'zod';

/**
 * Soportes documentales del suscriptor (ADR-110 D13). Esta fase solo los crea la importación
 * desde UISP (`origen` `IMPORTADO`, visibilidad interna, sin autor). La lectura no expone el
 * nombre del archivo original (no confiable y con posible PII): solo tipo, fecha y tamaño.
 */
export const SUBSCRIBER_DOCUMENT_ORIGINS = ['IMPORTADO'] as const;
export type SubscriberDocumentOrigin = (typeof SUBSCRIBER_DOCUMENT_ORIGINS)[number];

export const SUBSCRIBER_DOCUMENT_VISIBILITIES = ['INTERNA'] as const;
export type SubscriberDocumentVisibility = (typeof SUBSCRIBER_DOCUMENT_VISIBILITIES)[number];

export const SUBSCRIBER_DOCUMENT_KINDS = ['PDF', 'IMAGEN', 'OTRO'] as const;
export type SubscriberDocumentKind = (typeof SUBSCRIBER_DOCUMENT_KINDS)[number];

export const SubscriberDocumentSchema = z
  .object({
    id: z.string().uuid(),
    subscriberId: z.string().uuid(),
    kind: z.enum(SUBSCRIBER_DOCUMENT_KINDS),
    contentType: z.string().max(100),
    sizeBytes: z.number().int().min(0),
    origin: z.enum(SUBSCRIBER_DOCUMENT_ORIGINS),
    visibility: z.enum(SUBSCRIBER_DOCUMENT_VISIBILITIES),
    /** Fecha del documento si la fuente la trae; UISP no la trae (spec §1). */
    documentDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();
export type SubscriberDocument = z.infer<typeof SubscriberDocumentSchema>;

/** Códigos de error de los soportes del suscriptor (ADR-110 D13). */
export const SUBSCRIBER_DOCUMENT_ERROR_CODES = {
  SUBSCRIBER_DOCUMENT_NOT_FOUND: 'SUBSCRIBER_DOCUMENT_NOT_FOUND',
  SUBSCRIBER_DOCUMENT_RESTRICTED: 'SUBSCRIBER_DOCUMENT_RESTRICTED',
  SUBSCRIBER_DOCUMENT_TITULAR_RESTRICTED: 'SUBSCRIBER_DOCUMENT_TITULAR_RESTRICTED',
  SUBSCRIBER_DOCUMENT_UNREADABLE: 'SUBSCRIBER_DOCUMENT_UNREADABLE',
} as const;
export type SubscriberDocumentErrorCode =
  (typeof SUBSCRIBER_DOCUMENT_ERROR_CODES)[keyof typeof SUBSCRIBER_DOCUMENT_ERROR_CODES];
