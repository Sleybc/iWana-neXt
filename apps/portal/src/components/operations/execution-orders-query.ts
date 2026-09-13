// apps/portal/src/components/operations/execution-orders-query.ts
// URL ⇄ `ListExecutionOrdersQuery` para la bandeja de OT (spec 2026-09-13
// §4.5; contrato congelado `packages/shared/src/contracts/operations/
// execution-orders-list.ts` v1; ADR-065 §9: estado de bandeja en la URL).
//
// Scaffold F2: helpers puros sin cableado del endpoint — el listado de OT y
// su adopción por `ExecutionOrdersClient` son F5 (orden de despacho OLA2 §3).
import { ExecutionOrderResult, ExecutionOrderStatus, WfmWorkType } from '@iwana/shared';
import type { ListExecutionOrdersQuery } from '@iwana/shared';

function optionalEnumValue<T extends string>(
  value: string | null,
  allowed: readonly string[],
): T | undefined {
  if (value && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  return undefined;
}

function optionalNonEmptyText(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Formato fecha-only del rango de ventana en la URL (YYYY-MM-DD); la
 * conversión a ISO 8601 datetime ocurre al consultar (el backend la exige). */
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function optionalDateOnly(value: string | null): string | undefined {
  const trimmed = optionalNonEmptyText(value);
  return trimmed && DATE_ONLY_PATTERN.test(trimmed) ? trimmed : undefined;
}

function optionalPositiveInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/** Lee la query de la bandeja de OT desde la URL, ignorando valores no válidos. */
export function parseExecutionOrdersQuery(params: URLSearchParams): ListExecutionOrdersQuery {
  const query: ListExecutionOrdersQuery = {};
  const status = optionalEnumValue<ExecutionOrderStatus>(
    params.get('status'),
    Object.values(ExecutionOrderStatus),
  );
  const result = optionalEnumValue<ExecutionOrderResult>(
    params.get('result'),
    Object.values(ExecutionOrderResult),
  );
  const workType = optionalEnumValue<WfmWorkType>(
    params.get('workType'),
    Object.values(WfmWorkType),
  );
  const assigneeId = optionalNonEmptyText(params.get('assigneeId'));
  const organizationSiteId = optionalNonEmptyText(params.get('organizationSiteId'));
  const ticketId = optionalNonEmptyText(params.get('ticketId'));
  const taskId = optionalNonEmptyText(params.get('taskId'));
  const visitRequestId = optionalNonEmptyText(params.get('visitRequestId'));
  const windowFrom = optionalDateOnly(params.get('windowFrom'));
  const windowTo = optionalDateOnly(params.get('windowTo'));
  const page = optionalPositiveInt(params.get('page'));
  const limit = optionalPositiveInt(params.get('limit'));

  if (status) query.status = status;
  if (result) query.result = result;
  if (workType) query.workType = workType;
  if (assigneeId) query.assigneeId = assigneeId;
  if (organizationSiteId) query.organizationSiteId = organizationSiteId;
  if (ticketId) query.ticketId = ticketId;
  if (taskId) query.taskId = taskId;
  if (visitRequestId) query.visitRequestId = visitRequestId;
  if (windowFrom) query.windowFrom = windowFrom;
  if (windowTo) query.windowTo = windowTo;
  if (page) query.page = page;
  if (limit) query.limit = limit;
  return query;
}

/**
 * Parche de query con `undefined` explícito (exactOptionalPropertyTypes):
 * `undefined` elimina la clave al re-serializar; `page: undefined` reinicia a 1.
 */
export type ExecutionOrdersQueryPatch = {
  [K in keyof ListExecutionOrdersQuery]?: ListExecutionOrdersQuery[K] | undefined;
};

/** Serializa la query de bandeja de OT omitiendo valores por defecto y vacíos.
 * Acepta el parche (con `undefined`) porque serializa solo valores definidos. */
export function serializeExecutionOrdersQuery(query: ExecutionOrdersQueryPatch): string {
  const next = new URLSearchParams();
  if (query.status) next.set('status', query.status);
  if (query.result) next.set('result', query.result);
  if (query.workType) next.set('workType', query.workType);
  if (query.assigneeId) next.set('assigneeId', query.assigneeId);
  if (query.organizationSiteId) next.set('organizationSiteId', query.organizationSiteId);
  if (query.ticketId) next.set('ticketId', query.ticketId);
  if (query.taskId) next.set('taskId', query.taskId);
  if (query.visitRequestId) next.set('visitRequestId', query.visitRequestId);
  if (query.windowFrom) next.set('windowFrom', query.windowFrom);
  if (query.windowTo) next.set('windowTo', query.windowTo);
  if (query.page && query.page > 1) next.set('page', String(query.page));
  if (query.limit && query.limit !== 20) next.set('limit', String(query.limit));
  return next.toString();
}
