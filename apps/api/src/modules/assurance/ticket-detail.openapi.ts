import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  EXECUTION_ORDER_LOOKUP_LINKED_TICKET,
  EXECUTION_ORDER_NUMBER_PATTERN,
  ExecutionOrderResult,
  ExecutionOrderStatus,
  LINK_EXECUTION_ORDER_OUTCOMES,
  SlaBreachStatus,
  TICKET_ACTIVE_VISIT_STATUSES,
  TICKET_LINK_NOTES_MAX_LENGTH,
  TICKET_PARTY_NAME_STATES,
  TICKET_PARTY_PROFILE_KINDS,
  TICKET_TRANSITION_BLOCKED_REASONS,
  TICKET_VISIT_WINDOW_KINDS,
  TicketRequesterType,
  TicketStatus,
  TicketSubjectType,
  TicketType,
} from '@iwana/shared';

/**
 * Esquemas OpenAPI del detalle del ticket (spec MOD10 2026-11-16 §5 y bloque L; D4 =
 * orden de ejecución), espejo de `TicketDetailExtensionSchema` y compañía en `@iwana/shared`.
 */
const dateTimeOrNull: SchemaObject = { type: 'string', format: 'date-time', nullable: true };

export const TICKET_PARTY_REF_OPENAPI: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'refId', 'displayName', 'nameState', 'profile'],
  properties: {
    type: {
      type: 'string',
      enum: [
        ...new Set<string>([
          ...Object.values(TicketRequesterType),
          ...Object.values(TicketSubjectType),
        ]),
      ],
    },
    refId: { type: 'string', maxLength: 160, nullable: true },
    displayName: {
      type: 'string',
      maxLength: 300,
      nullable: true,
      description:
        'Solo con nameState = AVAILABLE. Nulo si el titular está suprimido o con datos bloqueados ' +
        '(aun con crm.blocked_data.read), sin permiso de lectura CRM, referencia no resoluble o ' +
        'sin verificar la privacidad.',
    },
    nameState: { type: 'string', enum: [...TICKET_PARTY_NAME_STATES] },
    profile: {
      type: 'object',
      nullable: true,
      additionalProperties: false,
      required: ['kind', 'id'],
      description: 'Ficha a la que enlazar; para un contrato, la del suscriptor titular.',
      properties: {
        kind: { type: 'string', enum: [...TICKET_PARTY_PROFILE_KINDS] },
        id: { type: 'string', format: 'uuid' },
      },
    },
  },
};

export const TICKET_ACTIVE_VISIT_OPENAPI: SchemaObject = {
  type: 'object',
  nullable: true,
  additionalProperties: false,
  description: 'Visita activa más reciente. Nula sin visita o sin wfm.schedule.read.',
  required: ['id', 'status', 'windowKind', 'windowStartAt', 'windowEndAt', 'scheduleEventId'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    status: {
      type: 'string',
      enum: [...TICKET_ACTIVE_VISIT_STATUSES],
      description: 'Nunca terminal (CLOSED, CANCELLED, REJECTED, EXPIRED).',
    },
    windowKind: { type: 'string', enum: [...TICKET_VISIT_WINDOW_KINDS], nullable: true },
    windowStartAt: dateTimeOrNull,
    windowEndAt: dateTimeOrNull,
    scheduleEventId: { type: 'string', format: 'uuid', nullable: true },
  },
};

const executionOrderProperties: Record<string, SchemaObject> = {
  id: { type: 'string', format: 'uuid' },
  number: { type: 'string', maxLength: 40, example: 'OTE-20261116-001' },
  status: { type: 'string', enum: Object.values(ExecutionOrderStatus) },
  result: { type: 'string', enum: Object.values(ExecutionOrderResult), nullable: true },
  closedAt: dateTimeOrNull,
};

export const TICKET_EXECUTION_ORDER_OPENAPI: SchemaObject = {
  type: 'object',
  nullable: true,
  additionalProperties: false,
  description:
    'Orden de ejecución más reciente no anulada. Nula sin orden o sin operations.execution_orders.read.',
  required: ['id', 'number', 'status', 'result', 'closedAt'],
  properties: executionOrderProperties,
};

export const TICKET_ALLOWED_TRANSITION_OPENAPI: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'requiresNote', 'blockedReason'],
  properties: {
    status: { type: 'string', enum: Object.values(TicketStatus) },
    requiresNote: { type: 'boolean', description: 'Solo RESOLVED exige nota.' },
    blockedReason: {
      type: 'string',
      enum: [...TICKET_TRANSITION_BLOCKED_REASONS],
      nullable: true,
      description: 'PQR_RECORD_INCOMPLETE: el servidor rechazaría el cambio.',
    },
  },
};

/** `GET /assurance/tickets/:id`: la entidad del ticket más los campos del detalle. */
export const TICKET_DETAIL_OPENAPI: SchemaObject = {
  type: 'object',
  required: [
    'id',
    'ticketNumber',
    'status',
    'type',
    'slaBreachStatus',
    'requester',
    'relatedTo',
    'activeVisit',
    'executionOrder',
    'executionOrderCount',
    'allowedTransitions',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    ticketNumber: { type: 'string' },
    status: { type: 'string', enum: Object.values(TicketStatus) },
    type: { type: 'string', enum: Object.values(TicketType) },
    slaBreachStatus: { type: 'string', enum: Object.values(SlaBreachStatus) },
    workOrderId: {
      type: 'string',
      format: 'uuid',
      nullable: true,
      description: 'Heredado: orden de programación (WFM). La orden vigente es executionOrder.',
    },
    requester: TICKET_PARTY_REF_OPENAPI,
    relatedTo: { ...TICKET_PARTY_REF_OPENAPI, nullable: true },
    activeVisit: TICKET_ACTIVE_VISIT_OPENAPI,
    executionOrder: TICKET_EXECUTION_ORDER_OPENAPI,
    executionOrderCount: {
      type: 'integer',
      minimum: 0,
      nullable: true,
      description: 'Órdenes no anuladas del ticket. Nulo sin operations.execution_orders.read.',
    },
    allowedTransitions: {
      type: 'array',
      description:
        'Destinos para quien consulta; vacío en estado terminal o sin permiso. Nunca incluye FIELD_SERVICE_REQUESTED.',
      items: TICKET_ALLOWED_TRANSITION_OPENAPI,
    },
  },
};

export const EXECUTION_ORDER_LOOKUP_OPENAPI: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'number', 'status', 'result', 'closedAt', 'linkedTicket'],
  properties: {
    ...executionOrderProperties,
    linkedTicket: {
      type: 'string',
      enum: [...EXECUTION_ORDER_LOOKUP_LINKED_TICKET],
      description: 'THIS solo si se envía ticketId y la orden ya es de ese ticket.',
    },
  },
};

export const LINK_EXECUTION_ORDER_BODY_OPENAPI: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['executionOrderId'],
  properties: {
    executionOrderId: { type: 'string', format: 'uuid' },
    notes: { type: 'string', maxLength: TICKET_LINK_NOTES_MAX_LENGTH, nullable: true },
  },
};

export const LINK_EXECUTION_ORDER_RESPONSE_OPENAPI: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'number', 'status', 'result', 'closedAt', 'outcome'],
  properties: {
    ...executionOrderProperties,
    outcome: {
      type: 'string',
      enum: [...LINK_EXECUTION_ORDER_OUTCOMES],
      description: 'ALREADY_LINKED: la orden ya era de este ticket; no se registra otro evento.',
    },
  },
};

/**
 * Parámetro `number` de `GET /assurance/execution-orders/lookup`. El servidor recorta espacios
 * y pasa a mayúsculas antes de validar el patrón.
 */
export const EXECUTION_ORDER_NUMBER_QUERY_OPENAPI: SchemaObject = {
  type: 'string',
  pattern: EXECUTION_ORDER_NUMBER_PATTERN.source,
  example: 'OTE-20261116-001',
};
