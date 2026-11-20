import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import {
  SUBSCRIBER_UPCOMING_VISIT_EVENT_STATUSES,
  SUBSCRIBER_UPCOMING_VISIT_REQUEST_STATUSES,
  SUBSCRIBER_UPCOMING_VISITS_LIMIT,
  UserRole,
  type ScheduleEventStatus,
  type SubscriberUpcomingVisitItem,
  type SubscriberUpcomingVisitOrigin,
  type SubscriberUpcomingVisitsResponse,
  type VisitRequestStatus,
  type WfmWorkType,
} from '@iwana/shared';
import { DataSource } from 'typeorm';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { CrmSubscriberReadPort } from '../../crm/ports/crm-subscriber-read.port';
import { AssuranceSubscriberTicketsReadPort } from '../../assurance/ports/assurance-subscriber-tickets-read.port';

/** Mismos roles que no acceden a la bandeja global de solicitudes. */
const RESTRICTED_ROLES: UserRole[] = [UserRole.TECHNICIAN, UserRole.CONTRACTOR];

type VisitRequestRow = {
  id: string;
  status: VisitRequestStatus;
  work_type: WfmWorkType;
  requested_window_start_at: Date | null;
  address: string | null;
  expediente_id: string | null;
  contract_id: string | null;
  ticket_id: string | null;
  created_at: Date;
};

type ScheduleEventRow = {
  id: string;
  status: ScheduleEventStatus;
  type: WfmWorkType;
  scheduled_start_at: Date;
  address: string | null;
  expediente_id: string | null;
  contract_id: string | null;
  ticket_id: string | null;
  created_at: Date;
};

type LinkedRequestRow = {
  id: string;
  schedule_event_id: string;
  requested_window_start_at: Date | null;
  address: string | null;
  expediente_id: string | null;
  contract_id: string | null;
  ticket_id: string | null;
};

/** Vínculo visita → suscriptor: directo, por su expediente, por un contrato o por un ticket suyo. */
const LINK_PREDICATE = (alias: string) => `(
    ${alias}.subscriber_id = $3::uuid
    OR ($4::uuid IS NOT NULL AND ${alias}.expediente_id = $4::uuid)
    OR ${alias}.contract_id = ANY($5::uuid[])
    OR ${alias}.ticket_id = ANY($6::text[])
  )`;

/** Solicitudes activas vinculadas, con su evento activo si lo tienen. */
const MATCHED_REQUESTS_CTE = `WITH matched_requests AS (
  SELECT vr.*, se.id AS active_event_id
    FROM visit_requests vr
    LEFT JOIN schedule_events se
      ON se.id = vr.schedule_event_id
     AND se.tenant_id = vr.tenant_id
     AND se.deleted_at IS NULL
     AND se.status::text = ANY($7::text[])
   WHERE vr.tenant_id = $1::uuid
     AND vr.deleted_at IS NULL
     AND vr.status::text = ANY($2::text[])
     AND ${LINK_PREDICATE('vr')}
)`;

/** Eventos activos vinculados o generados por una solicitud vinculada (sin duplicar). */
const MATCHED_EVENTS_CTE = `matched_events AS (
  SELECT se.*
    FROM schedule_events se
   WHERE se.tenant_id = $1::uuid
     AND se.deleted_at IS NULL
     AND se.status::text = ANY($7::text[])
     AND (
       ${LINK_PREDICATE('se')}
       OR se.id IN (SELECT active_event_id FROM matched_requests WHERE active_event_id IS NOT NULL)
     )
)`;

const iso = (value: Date | string | null): string | null =>
  value === null ? null : new Date(value).toISOString();

/**
 * Franja «Próximas visitas» de la pestaña Soporte (spec 2026-11-20 v1.1, bloque I, H13).
 * Visitas activas del suscriptor de cualquier origen; los tickets del suscriptor se resuelven
 * por el puerto de Assurance (sin leer sus tablas). Solo lee `visit_requests` y
 * `schedule_events`, propias de WFM, filtradas por el tenant del contexto verificado.
 */
@Injectable()
export class SubscriberUpcomingVisitsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(CrmSubscriberReadPort) private readonly crmSubscriberReadPort: CrmSubscriberReadPort,
    @Inject(AssuranceSubscriberTicketsReadPort)
    private readonly subscriberTicketsReadPort: AssuranceSubscriberTicketsReadPort,
  ) {}

  async list(subscriberId: string, actor: JwtPayload): Promise<SubscriberUpcomingVisitsResponse> {
    if (RESTRICTED_ROLES.includes(actor.role as UserRole)) {
      throw new ForbiddenException('No tienes permisos para consultar las visitas del suscriptor');
    }
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    // Puertos de los módulos dueños antes de abrir la transacción propia (sin anidar conexiones).
    const expedienteId = await this.crmSubscriberReadPort.findExpedienteId(
      tenantId,
      schemaName,
      subscriberId,
    );
    const contractIds = await this.crmSubscriberReadPort.listContractIds(
      tenantId,
      schemaName,
      subscriberId,
    );
    const tickets = await this.subscriberTicketsReadPort.listSubscriberTicketRefs(
      tenantId,
      schemaName,
      subscriberId,
    );
    const ticketNumbers = new Map(tickets.map((ticket) => [ticket.id, ticket.number]));
    const ticketIds = tickets.map((ticket) => ticket.id);

    // $1 tenant, $2 estados de solicitud, $3 suscriptor, $4 expediente, $5 contratos,
    // $6 tickets, $7 estados de evento. Mismos parámetros en las cuatro consultas.
    const params = [
      tenantId,
      [...SUBSCRIBER_UPCOMING_VISIT_REQUEST_STATUSES],
      subscriberId,
      expedienteId,
      contractIds,
      ticketIds,
      [...SUBSCRIBER_UPCOMING_VISIT_EVENT_STATUSES],
    ];
    const fetchLimit = SUBSCRIBER_UPCOMING_VISITS_LIMIT + 1;

    const { requests, events, linkedRequests, total } = await runInTenantSchema(
      this.dataSource,
      schemaName,
      async (qr) => {
        // Solicitudes por agendar: sin evento activo. Son las primeras de la franja.
        const requestRows = (await qr.query(
          `${MATCHED_REQUESTS_CTE}
           SELECT id::text AS id, status, work_type, requested_window_start_at, address,
                  expediente_id::text AS expediente_id, contract_id::text AS contract_id,
                  ticket_id, created_at
             FROM matched_requests
            WHERE active_event_id IS NULL
            ORDER BY created_at DESC, id DESC
            LIMIT ${fetchLimit}`,
          params,
        )) as VisitRequestRow[];

        // Eventos activos del suscriptor o de una solicitud suya; van después, por fecha.
        const eventRows = (await qr.query(
          `${MATCHED_REQUESTS_CTE}, ${MATCHED_EVENTS_CTE}
           SELECT id::text AS id, status, type, scheduled_start_at, address,
                  expediente_id::text AS expediente_id, contract_id::text AS contract_id,
                  ticket_id, created_at
             FROM matched_events
            ORDER BY scheduled_start_at ASC, id ASC
            LIMIT ${fetchLimit}`,
          params,
        )) as ScheduleEventRow[];

        // Solicitud que generó cada evento devuelto (acotada por los ids de la página).
        const linkedRows = (await qr.query(
          `SELECT DISTINCT ON (vr.schedule_event_id)
                  vr.id::text AS id, vr.schedule_event_id::text AS schedule_event_id,
                  vr.requested_window_start_at, vr.address, vr.expediente_id::text AS expediente_id,
                  vr.contract_id::text AS contract_id, vr.ticket_id
             FROM visit_requests vr
            WHERE vr.tenant_id = $1::uuid
              AND vr.deleted_at IS NULL
              AND vr.schedule_event_id = ANY($2::uuid[])
            ORDER BY vr.schedule_event_id, vr.created_at DESC, vr.id DESC`,
          [tenantId, eventRows.map((row) => row.id)],
        )) as LinkedRequestRow[];

        // Total exacto agregado en SQL: una visita por solicitud sin evento y por evento.
        const [countRow] = (await qr.query(
          `${MATCHED_REQUESTS_CTE}, ${MATCHED_EVENTS_CTE}
           SELECT (SELECT COUNT(*) FROM matched_requests WHERE active_event_id IS NULL)::int
                + (SELECT COUNT(*) FROM matched_events)::int AS total`,
          params,
        )) as Array<{ total: number }>;

        return {
          requests: requestRows,
          events: eventRows,
          linkedRequests: linkedRows,
          total: Number(countRow?.total ?? 0),
        };
      },
    );

    const requestByEventId = new Map(linkedRequests.map((row) => [row.schedule_event_id, row]));

    const items: SubscriberUpcomingVisitItem[] = [
      ...events.map((event) => {
        const request = requestByEventId.get(event.id) ?? null;
        return {
          key: `EVENT:${event.id}`,
          kind: 'EVENT' as const,
          id: event.id,
          visitRequestId: request?.id ?? null,
          scheduleEventId: event.id,
          status: event.status,
          workType: event.type,
          scheduledAt: iso(event.scheduled_start_at),
          requestedWindowStartAt: iso(request?.requested_window_start_at ?? null),
          address: event.address ?? request?.address ?? null,
          origin: buildOrigin(
            event.ticket_id ?? request?.ticket_id ?? null,
            event.expediente_id ?? request?.expediente_id ?? null,
            event.contract_id ?? request?.contract_id ?? null,
            ticketNumbers,
          ),
          createdAt: iso(event.created_at) as string,
        };
      }),
      ...requests.map((row) => ({
        key: `REQUEST:${row.id}`,
        kind: 'REQUEST' as const,
        id: row.id,
        visitRequestId: row.id,
        scheduleEventId: null,
        status: row.status,
        workType: row.work_type,
        scheduledAt: null,
        requestedWindowStartAt: iso(row.requested_window_start_at),
        address: row.address,
        origin: buildOrigin(row.ticket_id, row.expediente_id, row.contract_id, ticketNumbers),
        createdAt: iso(row.created_at) as string,
      })),
    ];

    const sorted = sortUpcomingVisits(items);
    return {
      items: sorted.slice(0, SUBSCRIBER_UPCOMING_VISITS_LIMIT),
      total,
      truncated: total > SUBSCRIBER_UPCOMING_VISITS_LIMIT,
    };
  }
}

/** Precedencia de origen: ticket > oportunidad > contrato > ninguno. */
export function buildOrigin(
  ticketId: string | null,
  expedienteId: string | null,
  contractId: string | null,
  ticketNumbers: ReadonlyMap<string, string>,
): SubscriberUpcomingVisitOrigin {
  const type = ticketId
    ? 'TICKET'
    : expedienteId
      ? 'OPPORTUNITY'
      : contractId
        ? 'CONTRACT'
        : 'NONE';
  return {
    type,
    ticketId: ticketId || null,
    ticketNumber: ticketId ? (ticketNumbers.get(ticketId) ?? null) : null,
    expedienteId,
    contractId,
  };
}

/** Por agendar primero (más recientes antes); luego agendadas por fecha ascendente. */
export function sortUpcomingVisits(
  items: SubscriberUpcomingVisitItem[],
): SubscriberUpcomingVisitItem[] {
  return [...items].sort((left, right) => {
    if (left.scheduledAt === null && right.scheduledAt !== null) return -1;
    if (left.scheduledAt !== null && right.scheduledAt === null) return 1;
    if (left.scheduledAt !== null && right.scheduledAt !== null) {
      const diff = Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt);
      if (diff !== 0) return diff;
    } else {
      const diff = Date.parse(right.createdAt) - Date.parse(left.createdAt);
      if (diff !== 0) return diff;
    }
    return left.key.localeCompare(right.key);
  });
}
