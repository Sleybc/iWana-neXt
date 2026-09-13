import { ExecutionOrderResult, ExecutionOrderStatus } from '../../enums/operations';
import { WfmWorkType } from '../../enums/wfm';
import { ExecutionOrderAssigneeView, Page } from './execution-orders';

/**
 * Contrato de API tipado del listado de OT de ejecución — MOD11.
 *
 * Archivo HERMANO del contrato congelado `execution-orders.ts`: nace separado
 * porque aquel declara "no modificar sin versionar" y este listado es un
 * contrato nuevo (spec 2026-09-13 §4.7.1, aprobada por el CTO). Este archivo
 * es la fuente de verdad del contrato de listado v1; un cambio posterior se
 * versiona y se notifica a AI-EM-ARCH, nunca se parchea en silencio
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
  /** Presente solo cuando la OT está cerrada. */
  result?: ExecutionOrderResult;
  workType: WfmWorkType;
  /** Ventana planificada; base del orden por defecto de la bandeja. */
  schedule: {
    eventId: string;
    window: { startAt: string; endAt: string };
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
export type ListExecutionOrdersResponse = Page<ExecutionOrderListItem>;
