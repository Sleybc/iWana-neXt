import { z } from 'zod';
import type { ListResponse } from '../dto/pagination.dto';
import { ListMetaSchema } from './list-meta.schema';

/**
 * Notas manuales del suscriptor (MOD05 ficha estilo UISP, bloque D, D3).
 * Registro aparte de la auditoría: se crean y se listan; no se editan ni se borran.
 * Contrato congelado 2026-11-10; cambia solo por versionado vía el orquestador.
 */
export const SUBSCRIBER_NOTE_BODY_MAX_LENGTH = 2000;

export const SubscriberNoteSchema = z.object({
  id: z.string().uuid(),
  subscriberId: z.string().uuid(),
  body: z.string().min(1).max(SUBSCRIBER_NOTE_BODY_MAX_LENGTH),
  createdBy: z.string().uuid(),
  /** ISO 8601. */
  createdAt: z.string().datetime({ offset: true }),
});

export const CreateSubscriberNoteSchema = z
  .object({
    body: z
      .string()
      .trim()
      .min(1, 'La nota no puede estar vacía.')
      .max(
        SUBSCRIBER_NOTE_BODY_MAX_LENGTH,
        `La nota admite máximo ${SUBSCRIBER_NOTE_BODY_MAX_LENGTH} caracteres.`,
      ),
  })
  .strict();

/** Respuesta paginada de `GET /crm/subscribers/:id/notes`, más reciente primero. */
export const SubscriberNoteListResponseSchema = z.object({
  data: z.array(SubscriberNoteSchema),
  meta: ListMetaSchema,
});

export type SubscriberNote = z.infer<typeof SubscriberNoteSchema>;
export type CreateSubscriberNote = z.infer<typeof CreateSubscriberNoteSchema>;
export type SubscriberNoteListResponse = ListResponse<SubscriberNote>;
