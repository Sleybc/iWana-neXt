import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { ASSURANCE_WORK_QUEUES, TICKET_LIST_ORDERS } from '@iwana/shared';
import {
  TICKET_ACTIVE_VISIT_OPENAPI,
  TICKET_EXECUTION_ORDER_OPENAPI,
} from './ticket-detail.openapi';

/**
 * Listado de tickets (spec MOD05 pestaña Soporte §16 B-1 a B-3), espejo de
 * `TicketListItemExtensionSchema` en `@iwana/shared`. Cada ticket es la entidad más estos campos.
 */
export const TICKET_LIST_OPENAPI: SchemaObject = {
  type: 'object',
  required: ['data', 'meta'],
  properties: {
    data: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'id',
          'attachmentCount',
          'assignedUserDisplayName',
          'activeVisit',
          'executionOrder',
          'requesterDisplayName',
        ],
        properties: {
          id: { type: 'string', format: 'uuid' },
          attachmentCount: {
            type: 'integer',
            minimum: 0,
            description:
              'Adjuntos que el usuario puede ver (sin los de comentarios internos si no los ve).',
          },
          assignedUserDisplayName: {
            type: 'string',
            maxLength: 201,
            nullable: true,
            example: 'Ana Pérez',
            description:
              'Nombre y apellido del responsable, sin exigir users.read. Nulo sin responsable o con ' +
              'el usuario desactivado (INACTIVE, SUSPENDED), inexistente, borrado o sin nombre.',
          },
          activeVisit: {
            ...TICKET_ACTIVE_VISIT_OPENAPI,
            description: 'Visita activa más reciente; nula sin visita o sin wfm.schedule.read.',
          },
          executionOrder: {
            ...TICKET_EXECUTION_ORDER_OPENAPI,
            description:
              'Orden de ejecución no anulada más reciente; nula sin orden o sin ' +
              'operations.execution_orders.read.',
          },
          requesterDisplayName: {
            type: 'string',
            maxLength: 300,
            nullable: true,
            example: 'Cliente Sintético',
            description:
              'Nombre visible del solicitante, con la regla del detalle: nulo si no es un ' +
              'suscriptor, sin crm.subscribers.read, con titular suprimido o con datos bloqueados, ' +
              'con referencia no resoluble o si CRM no responde.',
          },
        },
      },
    },
    meta: {
      type: 'object',
      required: ['total'],
      properties: {
        total: {
          type: 'integer',
          minimum: 0,
          description: 'Tickets que cumplen los filtros, aunque la página traiga menos.',
        },
      },
    },
  },
};

export const TICKET_LIST_ORDER_QUERY_OPENAPI: SchemaObject = {
  type: 'string',
  enum: [...TICKET_LIST_ORDERS],
  default: 'recent',
};

/** Conteo por cola de trabajo del resumen (spec MOD10 bandeja §3 J), espejo de `AssuranceWorkQueueCountsSchema`. */
export const ASSURANCE_WORK_QUEUE_COUNTS_OPENAPI: SchemaObject = {
  type: 'object',
  description:
    'Casos por cola de trabajo, relativos a quien consulta; cada valor coincide con meta.total ' +
    'de GET /assurance/tickets?workQueue=<cola>.',
  required: [...ASSURANCE_WORK_QUEUES],
  additionalProperties: false,
  properties: Object.fromEntries(
    ASSURANCE_WORK_QUEUES.map((queue) => [queue, { type: 'integer', minimum: 0 }]),
  ),
};
