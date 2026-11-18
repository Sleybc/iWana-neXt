import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  TICKET_ATTACHMENT_CONTENT_TYPES,
  TICKET_ATTACHMENT_FILENAME_MAX_LENGTH,
  TICKET_ATTACHMENT_STATUSES,
  TICKET_ATTACHMENTS_MAX_PER_COMMENT,
} from '@iwana/shared';

/**
 * Esquemas OpenAPI de los adjuntos de tickets, espejo de `TicketCommentAttachmentSchema` de
 * `@iwana/shared` (contrato congelado en el bloque A de la spec MOD09 adjuntos).
 */
export const TICKET_COMMENT_ATTACHMENT_OPENAPI: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'filename', 'contentType', 'sizeBytes', 'status'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    filename: { type: 'string', maxLength: TICKET_ATTACHMENT_FILENAME_MAX_LENGTH },
    contentType: { type: 'string', enum: [...TICKET_ATTACHMENT_CONTENT_TYPES] },
    sizeBytes: { type: 'integer', minimum: 1 },
    status: {
      type: 'string',
      enum: [...TICKET_ATTACHMENT_STATUSES],
      description: 'IN_REVIEW = «En revisión»; AVAILABLE; BLOCKED = «Archivo bloqueado».',
    },
  },
};

export const TICKET_COMMENT_WITH_ATTACHMENTS_OPENAPI: SchemaObject = {
  type: 'object',
  required: ['id', 'ticketId', 'body', 'isInternal', 'authorUserId', 'createdAt', 'attachments'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    ticketId: { type: 'string', format: 'uuid' },
    tenantId: { type: 'string', format: 'uuid' },
    body: { type: 'string' },
    isInternal: { type: 'boolean' },
    authorUserId: { type: 'string', format: 'uuid' },
    createdAt: { type: 'string', format: 'date-time' },
    attachments: {
      type: 'array',
      maxItems: TICKET_ATTACHMENTS_MAX_PER_COMMENT,
      items: TICKET_COMMENT_ATTACHMENT_OPENAPI,
    },
  },
};

/** `GET …/comments`: cada comentario trae `attachments` (siempre; `[]` si no tiene). */
export const TICKET_COMMENT_LIST_WITH_ATTACHMENTS_OPENAPI: SchemaObject = {
  type: 'array',
  items: TICKET_COMMENT_WITH_ATTACHMENTS_OPENAPI,
};

export const TICKET_ATTACHMENT_REJECTED_OPENAPI: SchemaObject = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: { type: 'string', example: 'TICKET_ATTACHMENT_REJECTED' },
    message: {
      type: 'string',
      example:
        '«informe.exe»: Tipo de archivo no permitido. Usa JPG, PNG, WebP, GIF, PDF o MP4. No se guardó el comentario ni sus archivos.',
    },
    rejected: {
      type: 'array',
      items: {
        type: 'object',
        required: ['index', 'filename', 'code', 'message'],
        properties: {
          index: { type: 'integer', minimum: 0 },
          filename: { type: 'string' },
          code: {
            type: 'string',
            enum: ['ARCHIVO_VACIO', 'TIPO_NO_PERMITIDO', 'FIRMA_NO_COINCIDE', 'TAMANO_EXCEDIDO'],
          },
          message: { type: 'string' },
        },
      },
    },
  },
};

export const TICKET_ATTACHMENT_LINK_OPENAPI: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['url', 'expiresAt', 'filename', 'contentType'],
  properties: {
    url: { type: 'string', format: 'uri', description: 'Enlace firmado; vence en 5 minutos.' },
    expiresAt: { type: 'string', format: 'date-time' },
    filename: { type: 'string' },
    contentType: { type: 'string', enum: [...TICKET_ATTACHMENT_CONTENT_TYPES] },
  },
};
