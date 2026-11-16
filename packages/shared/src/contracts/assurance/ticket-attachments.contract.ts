import { z } from 'zod';

/**
 * Adjuntos en comentarios de tickets (MOD09 Soporte; spec 2026-11-16 «adjuntos en tickets»,
 * §2.1, §2.2 y §2.5). Contrato congelado en el bloque A del plan.
 *
 * El archivo vive en el módulo de medios con el uso `ticket_attachment`
 * (`MediaUsage.TICKET_ATTACHMENT` de `@iwana/db`); la fila de Soporte es
 * `ticket_comment_attachments` (migración tenant 212).
 */

/** Valor de `media_assets.usage` para los adjuntos de tickets. */
export const TICKET_ATTACHMENT_MEDIA_USAGE = 'ticket_attachment' as const;

const MIB = 1024 * 1024;

/** Fotos admitidas: hasta 25 MB. */
export const TICKET_ATTACHMENT_IMAGE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

/** Tipos admitidos, validados por la firma real del archivo (nunca por extensión). */
export const TICKET_ATTACHMENT_CONTENT_TYPES = [
  ...TICKET_ATTACHMENT_IMAGE_CONTENT_TYPES,
  'application/pdf',
  'video/mp4',
] as const;
export type TicketAttachmentContentType = (typeof TICKET_ATTACHMENT_CONTENT_TYPES)[number];

/** Límite de fotos y PDF. */
export const TICKET_ATTACHMENT_DOCUMENT_MAX_BYTES = 25 * MIB;
/** Límite de `video/mp4`. */
export const TICKET_ATTACHMENT_VIDEO_MAX_BYTES = 100 * MIB;

export const TICKET_ATTACHMENT_MAX_BYTES_BY_CONTENT_TYPE: Readonly<
  Record<TicketAttachmentContentType, number>
> = {
  'image/jpeg': TICKET_ATTACHMENT_DOCUMENT_MAX_BYTES,
  'image/png': TICKET_ATTACHMENT_DOCUMENT_MAX_BYTES,
  'image/webp': TICKET_ATTACHMENT_DOCUMENT_MAX_BYTES,
  'image/gif': TICKET_ATTACHMENT_DOCUMENT_MAX_BYTES,
  'application/pdf': TICKET_ATTACHMENT_DOCUMENT_MAX_BYTES,
  'video/mp4': TICKET_ATTACHMENT_VIDEO_MAX_BYTES,
};

/** Máximo de archivos en un comentario. */
export const TICKET_ATTACHMENTS_MAX_PER_COMMENT = 10;
/** Longitud máxima del nombre saneado. */
export const TICKET_ATTACHMENT_FILENAME_MAX_LENGTH = 200;
/** Cuerpo máximo de la petición multipart del comentario con adjuntos (video máximo + margen, §2.5). */
export const TICKET_COMMENT_ATTACHMENTS_REQUEST_MAX_BYTES = 110 * MIB;

export function isTicketAttachmentContentType(value: string): value is TicketAttachmentContentType {
  return (TICKET_ATTACHMENT_CONTENT_TYPES as readonly string[]).includes(value);
}

/** Límite en bytes del tipo, o `null` si el tipo no se admite (comparación exacta). */
export function ticketAttachmentMaxBytes(contentType: string): number | null {
  return isTicketAttachmentContentType(contentType)
    ? TICKET_ATTACHMENT_MAX_BYTES_BY_CONTENT_TYPE[contentType]
    : null;
}

/**
 * Estado visible del adjunto, derivado de `media_assets.asset_status`:
 * - `IN_REVIEW` («En revisión»): `QUARANTINED`; no se descarga.
 * - `AVAILABLE`: se abre o descarga por enlace firmado.
 * - `BLOCKED` («Archivo bloqueado»): `REJECTED`, y también `EXPIRED`, `DELETED`, un activo
 *   ausente o cualquier estado desconocido (cerrado por defecto: nunca se sirve).
 */
export const TICKET_ATTACHMENT_STATUSES = ['IN_REVIEW', 'AVAILABLE', 'BLOCKED'] as const;
export type TicketAttachmentStatus = (typeof TICKET_ATTACHMENT_STATUSES)[number];

export function ticketAttachmentStatusFromMediaStatus(
  mediaStatus: string | null | undefined,
): TicketAttachmentStatus {
  if (mediaStatus === 'QUARANTINED') return 'IN_REVIEW';
  if (mediaStatus === 'AVAILABLE') return 'AVAILABLE';
  return 'BLOCKED';
}

/** Sin rutas (`/`, `\`) ni caracteres de control (incluye CR/LF: evita inyección en cabeceras). */
const FILENAME_FORBIDDEN = /[/\\\u0000-\u001f\u007f]/u;

export const TicketAttachmentFilenameSchema = z
  .string()
  .max(TICKET_ATTACHMENT_FILENAME_MAX_LENGTH)
  .refine((value) => value.trim().length > 0, 'El nombre del archivo no puede estar vacío.')
  .refine((value) => !FILENAME_FORBIDDEN.test(value), 'El nombre del archivo no es válido.');

/** Adjunto tal como lo expone la API dentro de un comentario o en el resumen del ticket. */
export const TicketCommentAttachmentSchema = z
  .object({
    id: z.string().uuid(),
    filename: TicketAttachmentFilenameSchema,
    contentType: z.enum(TICKET_ATTACHMENT_CONTENT_TYPES),
    sizeBytes: z.number().int().positive(),
    status: z.enum(TICKET_ATTACHMENT_STATUSES),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.sizeBytes > TICKET_ATTACHMENT_MAX_BYTES_BY_CONTENT_TYPE[value.contentType]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sizeBytes'],
        message: 'El archivo excede el tamaño permitido para su tipo.',
      });
    }
  });
export type TicketCommentAttachment = z.infer<typeof TicketCommentAttachmentSchema>;

/** Campo `attachments` del comentario: lista vacía por defecto (comentarios previos). */
export const TicketCommentAttachmentsSchema = z
  .array(TicketCommentAttachmentSchema)
  .max(TICKET_ATTACHMENTS_MAX_PER_COMMENT)
  .default([]);

/** Lo que el comentario del ticket añade a su respuesta. */
export interface TicketCommentAttachmentsField {
  attachments: TicketCommentAttachment[];
}

/** Campo `attachmentCount` del ticket en el listado: 0 por defecto. */
export const TicketListAttachmentCountSchema = z.number().int().min(0).default(0);

/** Lo que el ticket del listado añade a su respuesta. */
export interface TicketListAttachmentCountField {
  attachmentCount: number;
}
