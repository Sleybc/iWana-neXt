import { z } from 'zod';

/**
 * Etiquetas manuales del suscriptor (ADR-110 D8, plan transversal importación UISP, bloque T).
 * Catálogo por tenant (nombre único sin distinguir mayúsculas entre las vigentes, color
 * `#RRGGBB`) y asignación al suscriptor. Las etiquetas que iWana deriva (IVA, datos
 * faltantes, Siigo) no viven aquí. Contrato congelado 2026-11-11; cambia solo por
 * versionado vía el orquestador.
 */
export const SUBSCRIBER_TAG_NAME_MAX_LENGTH = 40;
/** Tope de etiquetas vigentes por tenant: el catálogo se lista completo, sin paginar. */
export const SUBSCRIBER_TAG_CATALOG_MAX = 200;
export const SUBSCRIBER_TAG_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

const tagNameSchema = z
  .string()
  .trim()
  .min(1, 'El nombre de la etiqueta no puede estar vacío.')
  .max(
    SUBSCRIBER_TAG_NAME_MAX_LENGTH,
    `El nombre admite máximo ${SUBSCRIBER_TAG_NAME_MAX_LENGTH} caracteres.`,
  );

const tagColorSchema = z
  .string()
  .regex(SUBSCRIBER_TAG_COLOR_PATTERN, 'El color debe tener el formato #RRGGBB.')
  .transform((value) => value.toUpperCase());

/** Chip que viaja en la lista, el detalle y la ficha del suscriptor. */
export const SubscriberTagChipSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(SUBSCRIBER_TAG_NAME_MAX_LENGTH),
  color: z.string().regex(SUBSCRIBER_TAG_COLOR_PATTERN),
});

/** Etiqueta del catálogo con el número de suscriptores que la tienen. */
export const SubscriberTagSchema = SubscriberTagChipSchema.extend({
  assignedCount: z.number().int().min(0),
  /** ISO 8601. */
  createdAt: z.string().datetime({ offset: true }),
  /** ISO 8601. */
  updatedAt: z.string().datetime({ offset: true }),
});

export const CreateSubscriberTagSchema = z
  .object({ name: tagNameSchema, color: tagColorSchema })
  .strict();

export const UpdateSubscriberTagSchema = z
  .object({ name: tagNameSchema.optional(), color: tagColorSchema.optional() })
  .strict()
  .refine((value) => value.name !== undefined || value.color !== undefined, {
    message: 'Indique el nombre o el color a cambiar.',
  });

/** `GET /crm/subscriber-tags`: catálogo completo ordenado por nombre. */
export const SubscriberTagListResponseSchema = z.object({
  data: z.array(SubscriberTagSchema),
});

/** `PUT|DELETE /crm/subscribers/:id/tags/:tagId`: etiquetas vigentes del suscriptor. */
export const SubscriberTagAssignmentResponseSchema = z.object({
  data: z.array(SubscriberTagChipSchema),
});

export const SUBSCRIBER_TAG_ERROR_CODES = [
  'SUBSCRIBER_TAG_NAME_TAKEN',
  'SUBSCRIBER_TAG_NOT_FOUND',
  'SUBSCRIBER_TAG_CATALOG_FULL',
] as const;
export type SubscriberTagErrorCode = (typeof SUBSCRIBER_TAG_ERROR_CODES)[number];

export type SubscriberTagChip = z.infer<typeof SubscriberTagChipSchema>;
export type SubscriberTag = z.infer<typeof SubscriberTagSchema>;
export type CreateSubscriberTag = z.infer<typeof CreateSubscriberTagSchema>;
export type UpdateSubscriberTag = z.infer<typeof UpdateSubscriberTagSchema>;
export type SubscriberTagListResponse = z.infer<typeof SubscriberTagListResponseSchema>;
export type SubscriberTagAssignmentResponse = z.infer<typeof SubscriberTagAssignmentResponseSchema>;
