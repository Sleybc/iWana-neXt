import { SlaBreachStatus, TicketStatus, type AssuranceWorkQueue } from '@iwana/shared';
import { AT_RISK_THRESHOLD_RATIO } from './sla.service';

/**
 * Fragmentos SQL compartidos por el listado y el resumen de la bandeja (spec MOD10 bandeja §3 J,
 * CA-10): el conteo de cada cola y el total de su lista salen de la MISMA expresión. Solo
 * literales de enums y columnas propias del alias `st`; la entrada del usuario va en parámetros.
 */

const quoted = (values: readonly string[]) => values.map((value) => `'${value}'`).join(', ');

/** Resuelto, cerrado o cancelado: fuera de «activo» (spec §4, D1). */
export const TERMINAL_TICKET_STATUSES = [
  TicketStatus.CANCELLED,
  TicketStatus.CLOSED,
  TicketStatus.RESOLVED,
] as const;

export const TERMINAL_STATUSES_SQL = quoted(TERMINAL_TICKET_STATUSES);

export const ACTIVE_TICKET_SQL = `(st.status NOT IN (${TERMINAL_STATUSES_SQL}))`;

/** CASE espejo de `SlaService.deriveBreachStatus` (DEF-2 D-1 / ADR-065 DEF-4). */
export const SLA_BREACH_CASE_SQL = `
      CASE
        WHEN st.status IN (${TERMINAL_STATUSES_SQL}) THEN
          CASE
            WHEN st.resolved_at IS NOT NULL
              AND st.sla_resolve_by_at IS NOT NULL
              AND st.resolved_at > st.sla_resolve_by_at
              THEN '${SlaBreachStatus.RESOLUTION_BREACHED}'
            WHEN st.first_responded_at IS NOT NULL
              AND st.sla_first_response_at IS NOT NULL
              AND st.first_responded_at > st.sla_first_response_at
              THEN '${SlaBreachStatus.FIRST_RESPONSE_BREACHED}'
            ELSE '${SlaBreachStatus.OK}'
          END
        WHEN st.first_responded_at IS NULL AND st.sla_first_response_at IS NOT NULL THEN
          CASE
            WHEN st.sla_first_response_at <= NOW()
              THEN '${SlaBreachStatus.FIRST_RESPONSE_BREACHED}'
            WHEN EXTRACT(EPOCH FROM (st.sla_first_response_at - st.created_at)) > 0
              AND EXTRACT(EPOCH FROM (st.sla_first_response_at - NOW()))
                <= EXTRACT(EPOCH FROM (st.sla_first_response_at - st.created_at)) * ${AT_RISK_THRESHOLD_RATIO}
              THEN '${SlaBreachStatus.AT_RISK}'
            ELSE '${SlaBreachStatus.OK}'
          END
        WHEN st.resolved_at IS NULL AND st.sla_resolve_by_at IS NOT NULL THEN
          CASE
            WHEN st.sla_resolve_by_at <= NOW()
              THEN '${SlaBreachStatus.RESOLUTION_BREACHED}'
            WHEN EXTRACT(EPOCH FROM (st.sla_resolve_by_at - st.created_at)) > 0
              AND EXTRACT(EPOCH FROM (st.sla_resolve_by_at - NOW()))
                <= EXTRACT(EPOCH FROM (st.sla_resolve_by_at - st.created_at)) * ${AT_RISK_THRESHOLD_RATIO}
              THEN '${SlaBreachStatus.AT_RISK}'
            ELSE '${SlaBreachStatus.OK}'
          END
        ELSE '${SlaBreachStatus.OK}'
      END`;

const BREACHED_SQL = `((${SLA_BREACH_CASE_SQL}) IN (${quoted([
  SlaBreachStatus.FIRST_RESPONSE_BREACHED,
  SlaBreachStatus.RESOLUTION_BREACHED,
])}))`;

/**
 * Predicado de cada cola de trabajo (spec §3 J). `mine` usa el parámetro `:workQueueActorId`,
 * que siempre es el `sub` del JWT verificado.
 */
export const WORK_QUEUE_PREDICATE_SQL: Readonly<Record<AssuranceWorkQueue, string>> = {
  mine: `(${ACTIVE_TICKET_SQL} AND st.assigned_user_id = :workQueueActorId)`,
  dueSoon: `((${SLA_BREACH_CASE_SQL}) = '${SlaBreachStatus.AT_RISK}')`,
  waitingCustomer: `(st.status = '${TicketStatus.PENDING_CUSTOMER}')`,
  fieldService: `(st.status = '${TicketStatus.FIELD_SERVICE_REQUESTED}')`,
  unassigned: `(${ACTIVE_TICKET_SQL} AND st.assigned_user_id IS NULL)`,
  breached: BREACHED_SQL,
  all: ACTIVE_TICKET_SQL,
};

/** Escapa `%`, `_` y `\` para ILIKE ... ESCAPE '\'. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/gu, (match) => `\\${match}`);
}

/** Cláusula ESCAPE de ILIKE con la barra invertida como carácter de escape. */
export const LIKE_ESCAPE_CLAUSE = String.raw`ESCAPE '\'`;
