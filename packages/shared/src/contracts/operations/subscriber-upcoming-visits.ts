import { z } from 'zod';
import { ScheduleEventStatus, VisitRequestStatus, WfmWorkType } from '../../enums/wfm';

/**
 * Contrato v1.0 (congelado 2026-11-20) de la franja «Próximas visitas» de la pestaña
 * Soporte del suscriptor (spec 2026-11-20-mod05-soporte-vista-dividida-ux v1.1, bloque I,
 * H13, CA-13, CA-15). `GET /wfm/subscribers/:subscriberId/upcoming-visits`.
 *
 * Una visita activa del suscriptor, de cualquier origen: oportunidad (expediente CRM),
 * contrato o ticket suyo (H13, resuelto por puerto de Assurance). Una sola fila por visita:
 * si la solicitud ya tiene evento de agenda activo, sale el evento con `visitRequestId`.
 * Cambiarlo exige versionar vía el orquestador.
 */

/** Estados de solicitud que la franja considera activos (pendiente o agendada sin cerrar). */
export const SUBSCRIBER_UPCOMING_VISIT_REQUEST_STATUSES = [
  VisitRequestStatus.PENDING,
  VisitRequestStatus.NEEDS_CONTEXT,
  VisitRequestStatus.READY_TO_SCHEDULE,
  VisitRequestStatus.REQUIRES_RESCHEDULE,
  VisitRequestStatus.SCHEDULED,
  VisitRequestStatus.IN_EXECUTION,
] as const;

/** Estados de evento de agenda que la franja considera activos. */
export const SUBSCRIBER_UPCOMING_VISIT_EVENT_STATUSES = [
  ScheduleEventStatus.DRAFT,
  ScheduleEventStatus.SCHEDULED,
  ScheduleEventStatus.EN_ROUTE,
  ScheduleEventStatus.IN_PROGRESS,
] as const;

/** Tope de filas: la franja no pagina; `truncated` avisa si hubo más. */
export const SUBSCRIBER_UPCOMING_VISITS_LIMIT = 50;

export const SUBSCRIBER_UPCOMING_VISIT_KINDS = ['REQUEST', 'EVENT'] as const;
export type SubscriberUpcomingVisitKind = (typeof SUBSCRIBER_UPCOMING_VISIT_KINDS)[number];

/**
 * Origen para enlazar: TICKET abre el ticket en la vista dividida; OPPORTUNITY y CONTRACT
 * abren la visita en la agenda; NONE es la visita vinculada solo al suscriptor
 * («Sin oportunidad ni contrato vinculado» en la sección retirada).
 * Precedencia: ticket > oportunidad > contrato.
 */
export const SUBSCRIBER_UPCOMING_VISIT_ORIGIN_TYPES = [
  'TICKET',
  'OPPORTUNITY',
  'CONTRACT',
  'NONE',
] as const;
export type SubscriberUpcomingVisitOriginType =
  (typeof SUBSCRIBER_UPCOMING_VISIT_ORIGIN_TYPES)[number];

export interface SubscriberUpcomingVisitOrigin {
  type: SubscriberUpcomingVisitOriginType;
  /** Id del ticket de Assurance; solo con `type = TICKET`. */
  ticketId: string | null;
  /** Número visible del ticket; null si no es de ticket o el ticket ya no existe. */
  ticketNumber: string | null;
  /** Id del expediente CRM (la «oportunidad» del portal). */
  expedienteId: string | null;
  contractId: string | null;
}

export interface SubscriberUpcomingVisitItem {
  /** `REQUEST:<id>` o `EVENT:<id>`; único en la respuesta. */
  key: string;
  kind: SubscriberUpcomingVisitKind;
  /** Id de la solicitud (kind REQUEST) o del evento (kind EVENT). */
  id: string;
  /** Solicitud de visita de la fila; en un evento, la solicitud que lo generó si existe. */
  visitRequestId: string | null;
  /** Evento de agenda de la fila; null en una solicitud aún sin evento («por agendar»). */
  scheduleEventId: string | null;
  /** `VisitRequestStatus` (kind REQUEST) o `ScheduleEventStatus` (kind EVENT). */
  status: VisitRequestStatus | ScheduleEventStatus;
  workType: WfmWorkType;
  /**
   * ISO 8601. Fecha agendada firme: `scheduled_start_at` del evento activo; null = «por agendar».
   * En filas REQUEST siempre es null, también si el estado de la solicitud es SCHEDULED o
   * IN_EXECUTION: una solicitud con evento activo sale como fila EVENT, así que la fila REQUEST
   * con esos estados es una solicitud sin evento activo (desfase de agenda) y se trata como
   * por agendar.
   */
  scheduledAt: string | null;
  /** ISO 8601. Inicio de la franja preferida de la solicitud; null si no hay. */
  requestedWindowStartAt: string | null;
  address: string | null;
  origin: SubscriberUpcomingVisitOrigin;
  /** ISO 8601. */
  createdAt: string;
}

export interface SubscriberUpcomingVisitsResponse {
  /** Primero las por agendar (más recientes primero), luego las agendadas por fecha ascendente. */
  items: SubscriberUpcomingVisitItem[];
  /** Total de visitas activas antes del tope (cuenta para «Visitas próximas»). */
  total: number;
  truncated: boolean;
}

const isoString = z.string().datetime({ offset: true });

export const SubscriberUpcomingVisitOriginSchema = z
  .object({
    type: z.enum(SUBSCRIBER_UPCOMING_VISIT_ORIGIN_TYPES),
    ticketId: z.string().min(1).nullable(),
    ticketNumber: z.string().nullable(),
    expedienteId: z.string().uuid().nullable(),
    contractId: z.string().uuid().nullable(),
  })
  .strict()
  .refine((origin) => (origin.type === 'TICKET') === (origin.ticketId !== null), {
    message: 'ticketId va solo y siempre con origen TICKET',
  });

export const SubscriberUpcomingVisitItemSchema = z
  .object({
    key: z.string().regex(/^(REQUEST|EVENT):/u),
    kind: z.enum(SUBSCRIBER_UPCOMING_VISIT_KINDS),
    id: z.string().uuid(),
    visitRequestId: z.string().uuid().nullable(),
    scheduleEventId: z.string().uuid().nullable(),
    status: z.union([z.nativeEnum(VisitRequestStatus), z.nativeEnum(ScheduleEventStatus)]),
    workType: z.nativeEnum(WfmWorkType),
    scheduledAt: isoString.nullable(),
    requestedWindowStartAt: isoString.nullable(),
    address: z.string().nullable(),
    origin: SubscriberUpcomingVisitOriginSchema,
    createdAt: isoString,
  })
  .strict();

export const SubscriberUpcomingVisitsResponseSchema = z
  .object({
    items: z.array(SubscriberUpcomingVisitItemSchema).max(SUBSCRIBER_UPCOMING_VISITS_LIMIT),
    total: z.number().int().min(0),
    truncated: z.boolean(),
  })
  .strict();
