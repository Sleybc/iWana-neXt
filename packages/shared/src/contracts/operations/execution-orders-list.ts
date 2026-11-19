import { ExecutionOrderResult, ExecutionOrderStatus } from '../../enums/operations';
import { WfmWorkType } from '../../enums/wfm';
import { ExecutionOrderAssigneeView, Page } from './execution-orders';
import { z } from 'zod';

/**
 * Contrato de API tipado del listado de OT de ejecución — MOD11.
 *
 * Archivo HERMANO del contrato congelado `execution-orders.ts`: nace separado
 * porque aquel declara "no modificar sin versionar" y este listado es un
 * contrato nuevo (spec 2026-09-13 §4.7.1, aprobada por el CTO). Este archivo
 * es la fuente de verdad del contrato de listado (v1.1 desde 2026-11-19:
 * colas y búsqueda por número); un cambio posterior se versiona y se notifica a AI-EM-ARCH, nunca se parchea en silencio
 * (protocolo multiagente §3bis regla 1).
 *
 * La proyección es deliberadamente más pobre que `ExecutionOrderDetail`:
 * - Sin `completion`, `syncState` ni `inventoryReconciliation` (sub-queries
 *   por fila: N+1 garantizado en un listado).
 * - Sin `serviceAddress`, `workInstructions` ni datos de contacto (ADR-067 §3:
 *   proyección mínima; la finalidad en bandeja no los justifica).
 * - Sin `template*` (snapshot pesado, irrelevante en la bandeja).
 *
 * La tabla de finalidad por campo (ADR-067 §2) está en
 * docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-G3-FACTIBILIDAD-BACKEND-v1.0.md.
 */

/** Fila de la bandeja de OT de ejecución (`GET /tasks/execution-orders`). */
export interface ExecutionOrderListItem {
  id: string;
  /** Número humano de la OT (columna de identificación y búsqueda). */
  number: string;
  status: ExecutionOrderStatus;
  /**
   * Anulación por error (ADR-090 §D3): las filas anuladas no se listan —la
   * bandeja las excluye—; el campo existe para que ningún consumidor confunda
   * una cancelación operativa con un error de creación si la recibe por otra
   * vía (detalle por id).
   */
  annulled: boolean;
  /** Presente solo cuando la OT está cerrada. */
  result?: ExecutionOrderResult;
  workType: WfmWorkType;
  /**
   * Ventana planificada; base del orden por defecto de la bandeja.
   * Nulable desde MOD11 E2 (contrato v1.3): una OT despachada sin cita emite
   * `eventId: null` y `window: null`. La fila se lista igual (200); E4 decide
   * la presentación «sin ventana».
   */
  schedule: {
    eventId: string | null;
    window: { startAt: string; endAt: string } | null;
  };
  /** Responsable asignado; ausente cuando la OT está sin asignar. */
  assignee?: ExecutionOrderAssigneeView;
  /** Etiqueta de presentación del cliente; sin dirección ni contacto (ADR-067 §3). */
  customerDisplayLabel: string;
  /** Municipio para agrupación de despacho; sin dirección exacta (ADR-067 §3). */
  municipality: string | null;
  /** Trazabilidad cruzada con Mesa de ayuda (MOD10). */
  ticketId: string | null;
  /** Trazabilidad con la tarea operativa derivada (bandeja de tareas). */
  taskId: string | null;
  /** Trazabilidad con la visita de Programación (MOD09) que originó la OT. */
  visitRequestId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Colas y búsqueda por número (contrato de listado v1.1, 2026-11-19) ──────
//
// Spec 2026-11-19-mod11-bandeja-ordenes-colas-ux §3 H–J y §4. Aditivo: sin
// `queue` ni `number` la respuesta es idéntica a la v1 (CA-12); `queueCounts`
// solo existe cuando la petición trae `queue`.

/**
 * Colas de la bandeja. Todas se combinan (AND) con los filtros sueltos y con
 * el alcance del actor; ninguna incluye anuladas (la bandeja nunca las lista).
 *
 * - `ALL`: sin restricción adicional (equivale a no enviar cola, pero pide conteos).
 * - `ACTIVE`: estado no terminal (fuera de `EXECUTION_ORDER_TERMINAL_STATUSES`).
 * - `TO_SCHEDULE`: activa y sin ventana planificada (`planned_window_start_at` nulo).
 * - `UNASSIGNED`: activa, sin técnico y sin cuadrilla.
 * - `TODAY`: ventana que empieza hoy en la zona horaria del tenant, en
 *   cualquier estado (D3: lo vencido no entra).
 * - `MINE`: activa y asignada como técnico a quien consulta (`sub` del JWT).
 */
export const EXECUTION_ORDER_QUEUES = [
  'ALL',
  'ACTIVE',
  'TO_SCHEDULE',
  'UNASSIGNED',
  'TODAY',
  'MINE',
] as const;
export type ExecutionOrderQueue = (typeof EXECUTION_ORDER_QUEUES)[number];
export const ExecutionOrderQueueSchema = z.enum(EXECUTION_ORDER_QUEUES);

/** Estados terminales: una OT en ellos no es «activa». */
export const EXECUTION_ORDER_TERMINAL_STATUSES = [
  ExecutionOrderStatus.COMPLETED,
  ExecutionOrderStatus.COMPLETED_WITH_OBSERVATIONS,
  ExecutionOrderStatus.NOT_EXECUTED,
  ExecutionOrderStatus.CANCELLED,
] as const;

/** Largo máximo de la búsqueda: el de la columna `execution_order_number`. */
export const EXECUTION_ORDER_NUMBER_SEARCH_MAX_LENGTH = 40;

/**
 * Búsqueda por número de OT: coincidencia parcial sin distinguir mayúsculas,
 * SOLO contra el número (nunca cliente ni otro campo: spec H9/CA-8).
 */
export const ExecutionOrderNumberSearchSchema = z
  .string()
  .trim()
  .min(1)
  .max(EXECUTION_ORDER_NUMBER_SEARCH_MAX_LENGTH)
  .regex(/^[A-Za-z0-9._/-]+$/u, 'Solo letras, dígitos y . _ / -');

/** Conteo por cola con el mismo filtro y alcance que el listado de la petición. */
export type ExecutionOrderQueueCounts = Record<ExecutionOrderQueue, number>;

/**
 * Query de `GET /tasks/execution-orders` (ADR-065 §10).
 *
 * - `limit` default 20, tope 100; `page * limit <= 10_000` vía `clampPage`.
 * - `cursor` NO existe en este recurso: `page` y `cursor` son mutuamente
 *   excluyentes (ADR-065 §10) y el recurso declara `randomAccess: true`.
 * - `sortBy`/`sortDir` se aceptan por el pipeline uniforme de ADR-065 §17,
 *   pero mientras `meta.capabilities.sortableFields` esté vacío el servidor
 *   los ignora (conserva el orden por defecto y emite `meta.sort: null`) y
 *   OpenAPI NO los anuncia (ADR-065 §22-bis punto 3). Poblar la lista blanca
 *   exige medición de p95 y autorización de AI-EM-ARCH.
 */
export interface ListExecutionOrdersQuery {
  status?: ExecutionOrderStatus;
  result?: ExecutionOrderResult;
  workType?: WfmWorkType;
  /** Técnico O cuadrilla (UUID). */
  assigneeId?: string;
  organizationSiteId?: string;
  ticketId?: string;
  taskId?: string;
  visitRequestId?: string;
  /** Rango sobre `planned_window_start_at`, ISO 8601. */
  windowFrom?: string;
  /** Rango sobre `planned_window_start_at`, ISO 8601. */
  windowTo?: string;
  /** Cola (v1.1). Su presencia añade `queueCounts` a la respuesta. */
  queue?: ExecutionOrderQueue;
  /** Búsqueda parcial por número de OT (v1.1); ver `ExecutionOrderNumberSearchSchema`. */
  number?: string;
  page?: number;
  limit?: number;
  /** Nombre lógico de campo (ADR-065 §17). Ignorado con lista blanca vacía. */
  sortBy?: string;
  /** Dirección del orden (ADR-065 §17). Ignorado con lista blanca vacía. */
  sortDir?: 'asc' | 'desc';
}

/**
 * Respuesta del listado: el `Page<T>` ya congelado del contrato hermano.
 * No nace envelope nuevo (spec §4.7.1); el alias solo nombra el reuso.
 * `meta.capabilities` v1: `{ randomAccess: true, sortableFields: [] }`.
 */
export type ListExecutionOrdersResponse = Page<ExecutionOrderListItem> & {
  /**
   * v1.1: presente SOLO si la petición trae `queue`. Cada conteo es el
   * `meta.total` que devolvería la misma petición con esa cola.
   */
  queueCounts?: ExecutionOrderQueueCounts;
};
