import { EXECUTION_ORDER_TERMINAL_STATUSES, type ExecutionOrderQueue } from '@iwana/shared';

/**
 * Colas de la bandeja de OT (contrato de listado v1.1, spec
 * 2026-11-19-mod11-bandeja-ordenes-colas-ux §3 H y §4).
 *
 * Un único predicado por cola, usado tanto en el `andWhere` del listado como
 * en el `COUNT(*) FILTER (WHERE …)` de los conteos: así el conteo de cada cola
 * es por construcción el `meta.total` de esa cola (CA-9). El predicado se
 * añade SIEMPRE sobre el QB ya scopeado (tenant, alcance del actor, anuladas
 * fuera, filtros sueltos y búsqueda), nunca en su lugar (R3).
 *
 * Nombres de parámetro con prefijo `queue` para no colisionar con los del QB.
 */
export interface ExecutionOrderQueueContext {
  /** `sub` del JWT verificado: «Mías» nunca sale del input. */
  actorSub: string;
  /** Zona IANA del tenant (R6): «Hoy» nunca usa la zona del servidor. */
  timezone: string;
  /** Instante de referencia de «Hoy». */
  now: Date;
}

export interface ExecutionOrderQueuePredicate {
  sql: string;
  params: Record<string, unknown>;
}

const ACTIVE_SQL = 'order.status NOT IN (:...queueTerminalStatuses)';

/** Inicio del día civil de `:queueNow` en `:queueTimezone`, como instante. */
const TODAY_START_SQL =
  "(date_trunc('day', CAST(:queueNow AS timestamptz) AT TIME ZONE CAST(:queueTimezone AS text))" +
  ' AT TIME ZONE CAST(:queueTimezone AS text))';
const TOMORROW_START_SQL =
  "((date_trunc('day', CAST(:queueNow AS timestamptz) AT TIME ZONE CAST(:queueTimezone AS text))" +
  " + interval '1 day') AT TIME ZONE CAST(:queueTimezone AS text))";

export function buildExecutionOrderQueuePredicate(
  queue: Exclude<ExecutionOrderQueue, 'ALL'>,
  context: ExecutionOrderQueueContext,
): ExecutionOrderQueuePredicate {
  const terminal = { queueTerminalStatuses: [...EXECUTION_ORDER_TERMINAL_STATUSES] };
  switch (queue) {
    case 'ACTIVE':
      return { sql: `(${ACTIVE_SQL})`, params: terminal };
    case 'TO_SCHEDULE':
      return {
        sql: `(${ACTIVE_SQL} AND order.planned_window_start_at IS NULL)`,
        params: terminal,
      };
    case 'UNASSIGNED':
      return {
        sql: `(${ACTIVE_SQL} AND order.assigned_technician_id IS NULL AND order.assigned_crew_id IS NULL)`,
        params: terminal,
      };
    case 'TODAY':
      return {
        sql:
          `(order.planned_window_start_at >= ${TODAY_START_SQL}` +
          ` AND order.planned_window_start_at < ${TOMORROW_START_SQL})`,
        params: { queueNow: context.now.toISOString(), queueTimezone: context.timezone },
      };
    case 'MINE':
      return {
        sql: `(${ACTIVE_SQL} AND order.assigned_technician_id = :queueActorSub)`,
        params: { ...terminal, queueActorSub: context.actorSub },
      };
  }
}

/** Escapa `\`, `%` y `_` para un `LIKE … ESCAPE '\'`. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/gu, (char) => `\\${char}`);
}
