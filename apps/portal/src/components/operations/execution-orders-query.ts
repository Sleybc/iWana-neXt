// apps/portal/src/components/operations/execution-orders-query.ts
// URL ⇄ `ListExecutionOrdersQuery` para la bandeja de OT (spec 2026-09-13
// §4.5; contrato congelado `packages/shared/src/contracts/operations/
// execution-orders-list.ts` v1; ADR-065 §9: estado de bandeja en la URL).
//
// Scaffold F2: helpers puros sin cableado del endpoint — el listado de OT y
// su adopción por `ExecutionOrdersClient` son F5 (orden de despacho OLA2 §3).
import {
  EXECUTION_ORDER_QUEUES,
  ExecutionOrderNumberSearchSchema,
  ExecutionOrderResult,
  ExecutionOrderStatus,
  WfmWorkType,
} from '@iwana/shared';
import type {
  ExecutionOrderQueue,
  ExecutionOrderQueueCounts,
  ListExecutionOrdersQuery,
} from '@iwana/shared';

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

/** Búsqueda por número (contrato v1.1): un valor que el servidor rechazaría
 * se ignora en vez de convertir la bandeja en un error. */
function optionalNumberSearch(value: string | null): string | undefined {
  if (value === null) return undefined;
  const parsed = ExecutionOrderNumberSearchSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
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
  const queue = optionalEnumValue<ExecutionOrderQueue>(params.get('queue'), EXECUTION_ORDER_QUEUES);
  const number = optionalNumberSearch(params.get('number'));
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
  if (queue) query.queue = queue;
  if (number) query.number = number;
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
  if (query.queue) next.set('queue', query.queue);
  if (query.number) next.set('number', query.number);
  if (query.page && query.page > 1) next.set('page', String(query.page));
  if (query.limit && query.limit !== 20) next.set('limit', String(query.limit));
  return next.toString();
}

/** Cola de entrada por defecto (spec 2026-11-19 §3 I). */
export const DEFAULT_EXECUTION_ORDER_QUEUE: ExecutionOrderQueue = 'ACTIVE';

/**
 * Parámetros que hacen «explícito» un enlace: si la URL trae cualquiera de
 * ellos y no trae `queue`, la bandeja no se reinterpreta como Activas (CA-10).
 * `page` y `limit` no cuentan: no filtran.
 */
const EXPLICIT_LINK_PARAMS = [
  'status',
  'result',
  'workType',
  'assigneeId',
  'organizationSiteId',
  'ticketId',
  'taskId',
  'visitRequestId',
  'windowFrom',
  'windowTo',
  'number',
  'executionOrderId',
] as const;

/**
 * Cola efectiva de la bandeja (§3 I y CA-10):
 * 1. `queue` válida en la URL → esa cola.
 * 2. Sin `queue` y sin ningún parámetro explícito → `ACTIVE` (entrada por defecto).
 * 3. Sin `queue` y con algún parámetro explícito → `ALL`: el enlace se respeta
 *    tal cual (`ALL` no restringe nada) y la bandeja sigue recibiendo conteos.
 */
export function resolveExecutionOrderQueue(params: URLSearchParams): ExecutionOrderQueue {
  const queue = optionalEnumValue<ExecutionOrderQueue>(params.get('queue'), EXECUTION_ORDER_QUEUES);
  if (queue) return queue;
  const hasExplicitParam = EXPLICIT_LINK_PARAMS.some((key) => Boolean(params.get(key)?.trim()));
  return hasExplicitParam ? 'ALL' : DEFAULT_EXECUTION_ORDER_QUEUE;
}

/**
 * Valida `queueCounts` de la respuesta sin cast: cada cola del contrato debe
 * traer un entero no negativo. Ausente o malformado → `null` (chips sin conteo).
 */
export function readExecutionOrderQueueCounts(value: unknown): ExecutionOrderQueueCounts | null {
  if (typeof value !== 'object' || value === null) return null;
  const counts: Partial<Record<ExecutionOrderQueue, number>> = {};
  for (const queue of EXECUTION_ORDER_QUEUES) {
    const count: unknown = Reflect.get(value, queue);
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) return null;
    counts[queue] = count;
  }
  return isCompleteQueueCounts(counts) ? counts : null;
}

function isCompleteQueueCounts(
  counts: Partial<Record<ExecutionOrderQueue, number>>,
): counts is ExecutionOrderQueueCounts {
  return EXECUTION_ORDER_QUEUES.every((queue) => typeof counts[queue] === 'number');
}
