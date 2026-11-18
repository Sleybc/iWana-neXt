import { z } from 'zod';
import { TicketRequesterType, TicketStatus, TicketSubjectType } from '../../enums/assurance';
import { ExecutionOrderResult, ExecutionOrderStatus } from '../../enums/operations';
import { VisitRequestStatus } from '../../enums/wfm';

/**
 * Detalle del ticket, paso 2 (spec MOD10 2026-11-16 «detalle del ticket compacto» §5 y
 * bloque L; D4 = orden de EJECUCIÓN). Campos que `GET /assurance/tickets/:id` añade a la
 * entidad; el listado no los trae. Nombres de titulares nulos desde el servidor cuando el
 * titular está bloqueado o suprimido, sin permiso CRM o sin verificar (R4).
 */

/** Estado del nombre visible: todo lo que no es AVAILABLE trae `displayName = null`. */
export const TICKET_PARTY_NAME_STATES = [
  /** Nombre servido. Puede ser nulo si el registro CRM no tiene nombre. */
  'AVAILABLE',
  /** Titular suprimido o con DATOS_BLOQUEADOS vigente (también para quien tiene crm.blocked_data.read). */
  'PROTECTED',
  /** Referencia no resoluble: inexistente, borrada o no UUID (referencias externas). */
  'NOT_FOUND',
  /** Tipo sin nombre en CRM (usuario interno, nodo, área, general…). */
  'NOT_APPLICABLE',
  /** Quien consulta no tiene el permiso de lectura del módulo CRM del dato. */
  'NOT_PERMITTED',
  /** No se pudo verificar la privacidad del titular: se oculta (fail-closed). */
  'UNAVAILABLE',
] as const;
export type TicketPartyNameState = (typeof TICKET_PARTY_NAME_STATES)[number];

/** Ficha a la que enlaza la parte; para un contrato es la del suscriptor titular. */
export const TICKET_PARTY_PROFILE_KINDS = ['SUBSCRIBER', 'EXPEDIENTE'] as const;
export type TicketPartyProfileKind = (typeof TICKET_PARTY_PROFILE_KINDS)[number];

export const TicketPartyRefSchema = z
  .object({
    type: z.union([z.nativeEnum(TicketRequesterType), z.nativeEnum(TicketSubjectType)]),
    refId: z.string().max(160).nullable(),
    displayName: z.string().max(300).nullable(),
    nameState: z.enum(TICKET_PARTY_NAME_STATES),
    profile: z
      .object({ kind: z.enum(TICKET_PARTY_PROFILE_KINDS), id: z.string().uuid() })
      .strict()
      .nullable(),
  })
  .strict()
  .refine((value) => value.nameState === 'AVAILABLE' || value.displayName === null, {
    message: 'Solo AVAILABLE puede traer nombre',
    path: ['displayName'],
  });
export type TicketPartyRef = z.infer<typeof TicketPartyRefSchema>;

/** Origen de la ventana: la del evento de agenda si está programada; si no, la pedida. */
export const TICKET_VISIT_WINDOW_KINDS = ['SCHEDULED', 'REQUESTED'] as const;
export type TicketVisitWindowKind = (typeof TICKET_VISIT_WINDOW_KINDS)[number];

/**
 * Estados de una visita activa: todos salvo los terminales (CLOSED, CANCELLED, REJECTED y
 * EXPIRED). El adaptador de programación filtra con esta misma lista.
 */
export const TICKET_ACTIVE_VISIT_STATUSES = [
  VisitRequestStatus.PENDING,
  VisitRequestStatus.NEEDS_CONTEXT,
  VisitRequestStatus.READY_TO_SCHEDULE,
  VisitRequestStatus.SCHEDULED,
  VisitRequestStatus.IN_EXECUTION,
  VisitRequestStatus.REQUIRES_RESCHEDULE,
] as const;
export type TicketActiveVisitStatus = (typeof TICKET_ACTIVE_VISIT_STATUSES)[number];

/** Visita activa: estado en `TICKET_ACTIVE_VISIT_STATUSES`, la más reciente. Sin datos personales. */
export const TicketActiveVisitSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(TICKET_ACTIVE_VISIT_STATUSES),
    windowKind: z.enum(TICKET_VISIT_WINDOW_KINDS).nullable(),
    windowStartAt: z.string().datetime().nullable(),
    windowEndAt: z.string().datetime().nullable(),
    scheduleEventId: z.string().uuid().nullable(),
  })
  .strict();
export type TicketActiveVisit = z.infer<typeof TicketActiveVisitSchema>;

/** Orden de ejecución (D4): la más reciente no anulada con `ticket_id` = ticket. Sin datos del cliente. */
export const TicketExecutionOrderSchema = z
  .object({
    id: z.string().uuid(),
    number: z.string().max(40),
    status: z.nativeEnum(ExecutionOrderStatus),
    result: z.nativeEnum(ExecutionOrderResult).nullable(),
    closedAt: z.string().datetime().nullable(),
  })
  .strict();
export type TicketExecutionOrder = z.infer<typeof TicketExecutionOrderSchema>;

export const TICKET_TRANSITION_BLOCKED_REASONS = ['PQR_RECORD_INCOMPLETE'] as const;
export type TicketTransitionBlockedReason = (typeof TICKET_TRANSITION_BLOCKED_REASONS)[number];

/**
 * Destino de estado para quien consulta. `requiresNote` solo en RESOLVED. Un destino con
 * `blockedReason` lo rechazaría el servidor (PQR sin registro completo).
 */
export const TicketAllowedTransitionSchema = z
  .object({
    status: z.nativeEnum(TicketStatus),
    requiresNote: z.boolean(),
    blockedReason: z.enum(TICKET_TRANSITION_BLOCKED_REASONS).nullable(),
  })
  .strict();
export type TicketAllowedTransition = z.infer<typeof TicketAllowedTransitionSchema>;

export const TicketDetailExtensionSchema = z
  .object({
    requester: TicketPartyRefSchema,
    /** Nulo si el ticket no tiene `subjectType`. */
    relatedTo: TicketPartyRefSchema.nullable(),
    /** Visita activa del ticket; nula sin visita o sin `wfm.schedule.read` (CA-12). */
    activeVisit: TicketActiveVisitSchema.nullable(),
    /**
     * Orden de ejecución más reciente no anulada; nula sin orden o sin
     * `operations.execution_orders.read` (CA-12).
     */
    executionOrder: TicketExecutionOrderSchema.nullable(),
    /**
     * Órdenes de ejecución no anuladas del ticket. Nulo sin `operations.execution_orders.read`
     * (CA-12): cero solo significa «sin órdenes» para quien puede verlas.
     */
    executionOrderCount: z.number().int().min(0).nullable(),
    /** Nunca nulo; vacío en estado terminal o sin permiso de cambiar estado. */
    allowedTransitions: z.array(TicketAllowedTransitionSchema),
  })
  .strict();
export type TicketDetailExtension = z.infer<typeof TicketDetailExtensionSchema>;

/** Número de la orden de ejecución (`OTE-AAAAMMDD-NNN`). Búsqueda exacta, sin prefijos. */
export const EXECUTION_ORDER_NUMBER_PATTERN = /^OTE-\d{8}-\d{3,6}$/;

export const ExecutionOrderLookupQuerySchema = z
  .object({
    number: z.string().trim().toUpperCase().pipe(z.string().regex(EXECUTION_ORDER_NUMBER_PATTERN)),
    /** Ticket desde el que se busca: con él la respuesta distingue THIS de OTHER. */
    ticketId: z.string().uuid().optional(),
  })
  .strict();
export type ExecutionOrderLookupQuery = z.output<typeof ExecutionOrderLookupQuerySchema>;

export const EXECUTION_ORDER_LOOKUP_LINKED_TICKET = ['NONE', 'THIS', 'OTHER'] as const;
export type ExecutionOrderLookupLinkedTicket =
  (typeof EXECUTION_ORDER_LOOKUP_LINKED_TICKET)[number];

export const ExecutionOrderLookupResponseSchema = TicketExecutionOrderSchema.extend({
  linkedTicket: z.enum(EXECUTION_ORDER_LOOKUP_LINKED_TICKET),
}).strict();
export type ExecutionOrderLookupResponse = z.infer<typeof ExecutionOrderLookupResponseSchema>;

export const TICKET_LINK_NOTES_MAX_LENGTH = 2000;

/**
 * Resultado del vínculo manual. LINKED: el módulo de órdenes escribió `ticket_id`.
 * ALREADY_LINKED: la orden ya era de este ticket (idempotente, sin evento en el historial).
 */
export const LINK_EXECUTION_ORDER_OUTCOMES = ['LINKED', 'ALREADY_LINKED'] as const;
export type LinkExecutionOrderOutcome = (typeof LINK_EXECUTION_ORDER_OUTCOMES)[number];

/** `POST /assurance/tickets/:id/link-execution-order`: la orden vinculada y el resultado. */
export const LinkExecutionOrderResponseSchema = TicketExecutionOrderSchema.extend({
  outcome: z.enum(LINK_EXECUTION_ORDER_OUTCOMES),
}).strict();
export type LinkExecutionOrderResponse = z.infer<typeof LinkExecutionOrderResponseSchema>;

export const LinkExecutionOrderBodySchema = z
  .object({
    executionOrderId: z.string().uuid(),
    notes: z.string().max(TICKET_LINK_NOTES_MAX_LENGTH).nullable().optional(),
  })
  .strict();
export type LinkExecutionOrderBody = z.output<typeof LinkExecutionOrderBodySchema>;
