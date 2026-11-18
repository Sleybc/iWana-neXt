import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { VisitRequest } from '@iwana/db';
import {
  TICKET_ACTIVE_VISIT_STATUSES,
  VisitRequestStatus,
  type TicketActiveVisitStatus,
} from '@iwana/shared';
import {
  FieldServiceWorkPort,
  CancelActiveForTicketResult,
  type TicketActiveVisitSnapshot,
} from '../../assurance/ports/field-service-work.port';

/**
 * Lista positiva del contrato compartido: un estado nuevo del enum no aparece como visita
 * activa hasta que el contrato lo admita (spec MOD10 §5; misma regla en detalle y listado).
 */
const ACTIVE_VISIT_STATUSES: readonly string[] = TICKET_ACTIVE_VISIT_STATUSES;

interface ActiveVisitRow {
  id: string;
  status: TicketActiveVisitStatus;
  requested_window_start_at: Date | string | null;
  requested_window_end_at: Date | string | null;
  schedule_event_id: string | null;
  scheduled_start_at: Date | string | null;
  scheduled_end_at: Date | string | null;
}

function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

/** Ventana del evento de agenda si está programada; si no, la pedida. Sin datos personales. */
function toActiveVisitSnapshot(row: ActiveVisitRow): TicketActiveVisitSnapshot {
  const scheduled = row.scheduled_start_at != null;
  const requested = row.requested_window_start_at != null;
  return {
    id: row.id,
    status: row.status,
    windowKind: scheduled ? 'SCHEDULED' : requested ? 'REQUESTED' : null,
    windowStartAt: toIso(scheduled ? row.scheduled_start_at : row.requested_window_start_at),
    windowEndAt: toIso(scheduled ? row.scheduled_end_at : row.requested_window_end_at),
    scheduleEventId: row.schedule_event_id,
  };
}

/**
 * Adapter WFM que implementa FieldServiceWorkPort.
 *
 * Cancela la visita activa asociada a un ticket cuando este se resuelve
 * o cierra sin necesidad de trabajo de campo (V8 / F4.2).
 *
 * Boundary: MOD10 (Assurance) no conoce las tablas de MOD09 (WFM).
 * Solo conoce la interfaz FieldServiceWorkPort.
 */
@Injectable()
export class FieldServiceWorkAdapter extends FieldServiceWorkPort {
  async findActiveForTicket(
    manager: EntityManager,
    tenantId: string,
    ticketId: string,
  ): Promise<TicketActiveVisitSnapshot | null> {
    const rows = (await manager.query(
      `SELECT vr.id::text AS id, vr.status, vr.requested_window_start_at,
              vr.requested_window_end_at, vr.schedule_event_id::text AS schedule_event_id,
              se.scheduled_start_at, se.scheduled_end_at
         FROM visit_requests vr
         LEFT JOIN schedule_events se
           ON se.id = vr.schedule_event_id
          AND se.tenant_id = vr.tenant_id
          AND se.deleted_at IS NULL
        WHERE vr.tenant_id = $1::uuid
          AND vr.ticket_id = $2
          AND vr.deleted_at IS NULL
          AND vr.status::text = ANY($3::text[])
        ORDER BY vr.created_at DESC, vr.id DESC
        LIMIT 1`,
      [tenantId, ticketId, ACTIVE_VISIT_STATUSES],
    )) as ActiveVisitRow[];
    const row = rows[0];
    return row ? toActiveVisitSnapshot(row) : null;
  }

  async findActiveForTickets(
    manager: EntityManager,
    tenantId: string,
    ticketIds: readonly string[],
  ): Promise<ReadonlyMap<string, TicketActiveVisitSnapshot>> {
    const ids = [...new Set(ticketIds)];
    const visits = new Map<string, TicketActiveVisitSnapshot>();
    if (ids.length === 0) return visits;
    const rows = (await manager.query(
      `SELECT DISTINCT ON (vr.ticket_id)
              vr.ticket_id, vr.id::text AS id, vr.status, vr.requested_window_start_at,
              vr.requested_window_end_at, vr.schedule_event_id::text AS schedule_event_id,
              se.scheduled_start_at, se.scheduled_end_at
         FROM visit_requests vr
         LEFT JOIN schedule_events se
           ON se.id = vr.schedule_event_id
          AND se.tenant_id = vr.tenant_id
          AND se.deleted_at IS NULL
        WHERE vr.tenant_id = $1::uuid
          AND vr.ticket_id = ANY($2::varchar[])
          AND vr.deleted_at IS NULL
          AND vr.status::text = ANY($3::text[])
        ORDER BY vr.ticket_id, vr.created_at DESC, vr.id DESC`,
      [tenantId, ids, ACTIVE_VISIT_STATUSES],
    )) as Array<ActiveVisitRow & { ticket_id: string }>;
    for (const row of rows) visits.set(row.ticket_id, toActiveVisitSnapshot(row));
    return visits;
  }

  async cancelActiveForTicket(
    manager: EntityManager,
    tenantId: string,
    ticketId: string,
    reason: string,
    actorUserId: string,
  ): Promise<CancelActiveForTicketResult> {
    // Buscar VisitRequest activa (no terminal) asociada al ticket
    const visitRequest = await manager.findOne(VisitRequest, {
      where: { tenantId, ticketId },
    });

    if (!visitRequest) {
      return { cancelled: false, visitRequestId: null };
    }

    // Si ya está en estado terminal, no hacer nada
    const terminalStatuses: VisitRequestStatus[] = [
      VisitRequestStatus.CANCELLED,
      VisitRequestStatus.REJECTED,
      VisitRequestStatus.CLOSED,
      VisitRequestStatus.EXPIRED,
    ];

    if (terminalStatuses.includes(visitRequest.status)) {
      return { cancelled: false, visitRequestId: visitRequest.id };
    }

    // Si la visita ya está agendada (SCHEDULED), cancelar con advertencia
    // pero aun así proceder (el ticket se resolvió, la visita sobra)
    await manager.update(
      VisitRequest,
      { id: visitRequest.id, tenantId },
      {
        status: VisitRequestStatus.CANCELLED,
        cancelReason: reason,
        cancelledAt: new Date(),
        cancelledByUserId: actorUserId,
      },
    );

    return { cancelled: true, visitRequestId: visitRequest.id };
  }
}
