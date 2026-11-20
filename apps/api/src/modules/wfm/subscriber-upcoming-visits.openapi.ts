import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  ScheduleEventStatus,
  SUBSCRIBER_UPCOMING_VISIT_KINDS,
  SUBSCRIBER_UPCOMING_VISIT_ORIGIN_TYPES,
  SUBSCRIBER_UPCOMING_VISITS_LIMIT,
  VisitRequestStatus,
  WfmWorkType,
} from '@iwana/shared';

const nullableUuid: SchemaObject = { type: 'string', format: 'uuid', nullable: true };
const nullableDate: SchemaObject = { type: 'string', format: 'date-time', nullable: true };

/**
 * `GET /wfm/subscribers/:subscriberId/upcoming-visits` (spec 2026-11-20 v1.1, bloque I, H13),
 * espejo de `SubscriberUpcomingVisitsResponseSchema` en `@iwana/shared` (contrato v1.0).
 */
export const SUBSCRIBER_UPCOMING_VISITS_OPENAPI: SchemaObject = {
  type: 'object',
  required: ['items', 'total', 'truncated'],
  properties: {
    items: {
      type: 'array',
      maxItems: SUBSCRIBER_UPCOMING_VISITS_LIMIT,
      description:
        'Visitas activas del suscriptor de cualquier origen (oportunidad, contrato o ticket suyo), una fila por visita. Primero las por agendar, luego las agendadas por fecha.',
      items: {
        type: 'object',
        required: [
          'key',
          'kind',
          'id',
          'visitRequestId',
          'scheduleEventId',
          'status',
          'workType',
          'scheduledAt',
          'requestedWindowStartAt',
          'address',
          'origin',
          'createdAt',
        ],
        properties: {
          key: { type: 'string', description: '`REQUEST:<id>` o `EVENT:<id>`; único.' },
          kind: { type: 'string', enum: [...SUBSCRIBER_UPCOMING_VISIT_KINDS] },
          id: { type: 'string', format: 'uuid' },
          visitRequestId: {
            ...nullableUuid,
            description: 'Solicitud de la fila; en un evento, la solicitud que lo generó.',
          },
          scheduleEventId: {
            ...nullableUuid,
            description: 'Evento de agenda; null en una solicitud por agendar.',
          },
          status: {
            type: 'string',
            enum: [
              ...new Set([
                ...Object.values(VisitRequestStatus),
                ...Object.values(ScheduleEventStatus),
              ]),
            ],
            description: 'VisitRequestStatus si kind=REQUEST; ScheduleEventStatus si kind=EVENT.',
          },
          workType: { type: 'string', enum: Object.values(WfmWorkType) },
          scheduledAt: {
            ...nullableDate,
            description:
              'Fecha del evento activo; null = «por agendar». Siempre null en filas REQUEST, aunque el estado sea SCHEDULED o IN_EXECUTION (solicitud sin evento activo).',
          },
          requestedWindowStartAt: {
            ...nullableDate,
            description: 'Franja preferida de la solicitud.',
          },
          address: { type: 'string', nullable: true },
          origin: {
            type: 'object',
            required: ['type', 'ticketId', 'ticketNumber', 'expedienteId', 'contractId'],
            properties: {
              type: {
                type: 'string',
                enum: [...SUBSCRIBER_UPCOMING_VISIT_ORIGIN_TYPES],
                description: 'Precedencia ticket > oportunidad > contrato > ninguno.',
              },
              ticketId: {
                type: 'string',
                nullable: true,
                description: 'Solo y siempre con type=TICKET.',
              },
              ticketNumber: { type: 'string', nullable: true },
              expedienteId: { ...nullableUuid, description: 'Expediente CRM (oportunidad).' },
              contractId: nullableUuid,
            },
          },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
    total: { type: 'integer', minimum: 0, description: 'Visitas activas antes del tope.' },
    truncated: { type: 'boolean' },
  },
};
