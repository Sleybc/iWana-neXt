// apps/portal/src/components/operations/tasks-query.ts
// URL ⇄ `ListOperationalTasksParams` para la bandeja de tareas (spec 2026-09-13
// §4.5, ADR-065 §9: página, tamaño, filtros y detalle abierto viven en la URL).
//
// F2 extrae los helpers puros; su adopción completa por `TasksInboxClient`
// (filtros y página en URL) es F5. En F2 el consumidor lee únicamente
// `taskId` (deep link del detalle, spec §4.6).
import { TaskStatus, TaskType } from '@iwana/shared';
import type { ListOperationalTasksParams } from '@/lib/api-client';

/** Parámetros de bandeja + detalle abierto (`?taskId=`). */
export interface TasksInboxQuery extends ListOperationalTasksParams {
  taskId?: string;
}

/**
 * Parche de query con `undefined` explícito (exactOptionalPropertyTypes):
 * `undefined` elimina la clave al re-serializar; `page: undefined` reinicia a 1.
 */
export type TasksInboxQueryPatch = {
  [K in keyof TasksInboxQuery]?: TasksInboxQuery[K] | undefined;
};

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

function optionalPositiveInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/** Lee la query de la bandeja desde la URL, ignorando valores no válidos. */
export function parseTasksInboxQuery(params: URLSearchParams): TasksInboxQuery {
  const query: TasksInboxQuery = {};
  const status = optionalEnumValue<TaskStatus>(params.get('status'), Object.values(TaskStatus));
  const type = optionalEnumValue<TaskType>(params.get('type'), Object.values(TaskType));
  const responsibleRefId = optionalNonEmptyText(params.get('responsibleRefId'));
  const ticketId = optionalNonEmptyText(params.get('ticketId'));
  const page = optionalPositiveInt(params.get('page'));
  const limit = optionalPositiveInt(params.get('limit'));
  const taskId = optionalNonEmptyText(params.get('taskId'));

  if (status) query.status = status;
  if (type) query.type = type;
  if (responsibleRefId) query.responsibleRefId = responsibleRefId;
  if (ticketId) query.ticketId = ticketId;
  if (page) query.page = page;
  if (limit) query.limit = limit;
  if (taskId) query.taskId = taskId;
  return query;
}

/** Serializa la query de bandeja omitiendo valores por defecto y vacíos.
 * Acepta el parche (con `undefined`) porque serializa solo valores definidos. */
export function serializeTasksInboxQuery(query: TasksInboxQueryPatch): string {
  const next = new URLSearchParams();
  if (query.status) next.set('status', query.status);
  if (query.type) next.set('type', query.type);
  if (query.responsibleRefId) next.set('responsibleRefId', query.responsibleRefId);
  if (query.ticketId) next.set('ticketId', query.ticketId);
  if (query.page && query.page > 1) next.set('page', String(query.page));
  if (query.limit && query.limit !== 20) next.set('limit', String(query.limit));
  if (query.taskId) next.set('taskId', query.taskId);
  return next.toString();
}
