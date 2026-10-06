import { useCallback, useRef } from 'react';
import type {
  ExecutionOrderActivity,
  ExecutionOrderItemUsage,
  ExecutionOrderEvidence,
  ListMeta,
} from '@iwana/shared';
import { ApiError, tasksApi, type ExecutionOrderDetailResponse } from '@/lib/api-client';
import type { RequirementActionDescriptor } from './execution-order-actions';
import {
  collectExecutionOrderCollectionPages,
  type CollectedExecutionOrderCollection,
} from './execution-order-collections';
import { mapOperationsError } from './execution-order-requirements';

// apps/portal/src/components/operations/use-execution-order-refresh.ts
// Slot R4 (Ola 2b, CA-12) — política de refresco por mutación de la consola de OT.
//
// Antes cada mutación volvía a abrir la OT: detalle, actividades, consumos,
// evidencias, inventario y custodia (seis lecturas). Ahora cada mutación relee
// solo lo que pudo cambiar (G3 §4, UX §11.2.5):
//
//   mutación      lecturas posteriores
//   start         detalle
//   close         detalle
//   activity      detalle + actividades
//   consumption   detalle + consumos (+ custodia solo si el acto MATERIAL sigue abierto)
//   evidence      detalle + evidencias
//
// El detalle trae la evaluación publicada del cierre (`completion`), así que
// releerlo es lo que mantiene versión, acciones permitidas y checklist: el
// cliente nunca recalcula el completion ni amplía autorizaciones.
//
// Garantías de la política:
// - Un fallo de una lectura no borra datos válidos: solo se reemplaza el recurso
//   cuya lectura llegó; el resto conserva lo que ya se mostraba.
// - El refresco nunca rechaza: el registro ya ocurrió y los manejadores de
//   mutación lo interpretarían como un fallo del registro. Los fallos se
//   informan por `setError`.
// - No se enciende ningún indicador de carga que desmonte lo ya mostrado:
//   `setLoadingDetail` hace que el contenedor sustituya la orden por un esqueleto
//   y los demás son banderas de «cargar más». El estado ocupado de la mutación lo
//   cubre `isSubmitting`, que los manejadores mantienen hasta que el refresco
//   termina.
// - Un resultado de una OT anterior no pisa a la vigente (navegación o cierre
//   durante el vuelo) y, entre dos refrescos solapados del mismo recurso, gana
//   el último.

export type ExecutionOrderMutation = 'start' | 'activity' | 'consumption' | 'evidence' | 'close';
export interface ExecutionOrderRefreshAdapter {
  openExecutionOrder: (executionOrderId: string) => Promise<void>;
  selectedExecutionOrder: ExecutionOrderDetailResponse | null;
  setDetail: (value: ExecutionOrderDetailResponse) => void;
  setActivities: (value: ExecutionOrderActivity[]) => void;
  setActivitiesMeta: (value: ListMeta) => void;
  setItemUsage: (value: ExecutionOrderItemUsage[]) => void;
  setItemUsageMeta: (value: ListMeta) => void;
  setItemUsageError: (value: string | null) => void;
  setEvidence: (value: ExecutionOrderEvidence[]) => void;
  setEvidenceMeta: (value: ListMeta) => void;
  requestSequence: { current: number };
  setError: (value: string | null) => void;
  setSuccess: (value: string | null) => void;
  setLoadingDetail: (value: boolean) => void;
  setEvidenceState: (value: 'loading' | 'available' | 'unavailable') => void;
  setLoadingActivities: (value: boolean) => void;
  setLoadingItemUsage: (value: boolean) => void;
  setLoadingEvidence: (value: boolean) => void;
  activeConsumptionRequirement: { current: RequirementActionDescriptor | null };
  refreshOpenCustody: () => void;
}

export type ExecutionOrderRefreshResource = 'detail' | 'activities' | 'itemUsage' | 'evidence';

/** Matriz mutación → lecturas posteriores. La custodia se decide aparte (acto abierto). */
export const EXECUTION_ORDER_REFRESH_PLAN: Readonly<
  Record<ExecutionOrderMutation, readonly ExecutionOrderRefreshResource[]>
> = {
  start: ['detail'],
  close: ['detail'],
  activity: ['detail', 'activities'],
  consumption: ['detail', 'itemUsage'],
  evidence: ['detail', 'evidence'],
};

const RESOURCE_LABELS: Record<ExecutionOrderRefreshResource, string> = {
  detail: 'el detalle de la orden',
  activities: 'el historial de actividades',
  itemUsage: 'el historial de consumos',
  evidence: 'el historial de evidencias',
};

type ReadResult =
  | { resource: 'detail'; value: ExecutionOrderDetailResponse }
  | { resource: 'activities'; value: CollectedExecutionOrderCollection<ExecutionOrderActivity> }
  | { resource: 'itemUsage'; value: CollectedExecutionOrderCollection<ExecutionOrderItemUsage> }
  | { resource: 'evidence'; value: CollectedExecutionOrderCollection<ExecutionOrderEvidence> };

async function readResource(
  resource: ExecutionOrderRefreshResource,
  executionOrderId: string,
): Promise<ReadResult> {
  switch (resource) {
    case 'detail':
      return { resource, value: await tasksApi.executionOrders.get(executionOrderId) };
    case 'activities':
      return {
        resource,
        value: await collectExecutionOrderCollectionPages((page, limit) =>
          tasksApi.executionOrders.listActivities(executionOrderId, { page, limit }),
        ),
      };
    case 'itemUsage':
      return {
        resource,
        value: await collectExecutionOrderCollectionPages((page, limit) =>
          tasksApi.executionOrders.listItemUsage(executionOrderId, { page, limit }),
        ),
      };
    case 'evidence':
      return {
        resource,
        value: await collectExecutionOrderCollectionPages((page, limit) =>
          tasksApi.executionOrders.listEvidence(executionOrderId, { page, limit }),
        ),
      };
  }
}

function joinLabels(labels: string[]): string {
  return labels.length > 1
    ? `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`
    : (labels[0] ?? '');
}

/** Sesión vencida, permisos u OT retirada se dicen tal cual; el resto nombra el recurso. */
function refreshFailureMessage(
  failures: ExecutionOrderRefreshResource[],
  reasons: unknown[],
): string {
  const specific = reasons.find(
    (reason) => reason instanceof ApiError && [401, 403, 404].includes(reason.status),
  );
  if (specific) return mapOperationsError(specific);
  return `No pudimos actualizar ${joinLabels(failures.map((resource) => RESOURCE_LABELS[resource]))}. Lo que ves puede no estar al día.`;
}

/**
 * Devuelve `(executionOrderId, mutation) => Promise<void>`: relee solo lo que la
 * mutación pudo cambiar. La función devuelta es referencialmente estable.
 */
export function useExecutionOrderRefresh(context: ExecutionOrderRefreshAdapter) {
  // El contexto cambia por render; la política lee siempre el último.
  const latest = useRef(context);
  latest.current = context;
  // Ficha por recurso: entre dos refrescos solapados solo aplica el último.
  const generations = useRef<Record<ExecutionOrderRefreshResource, number>>({
    detail: 0,
    activities: 0,
    itemUsage: 0,
    evidence: 0,
  });

  return useCallback(async (executionOrderId: string, mutation: ExecutionOrderMutation) => {
    const start = latest.current;
    // Solo se refresca la OT que está a la vista: si ya se cerró o se cambió de
    // orden mientras la mutación estaba en vuelo, no hay nada que actualizar.
    if (start.selectedExecutionOrder?.id !== executionOrderId) return;

    const sequence = start.requestSequence.current;
    const resources = EXECUTION_ORDER_REFRESH_PLAN[mutation];
    const tickets = resources.map((resource) => ({
      resource,
      generation: ++generations.current[resource],
    }));

    const results = await Promise.allSettled(
      resources.map((resource) => readResource(resource, executionOrderId)),
    );

    // Abrir o cerrar la consola durante el vuelo invalida la lectura completa.
    const current = latest.current;
    if (
      current.requestSequence.current !== sequence ||
      current.selectedExecutionOrder?.id !== executionOrderId
    ) {
      return;
    }

    const failures: ExecutionOrderRefreshResource[] = [];
    const reasons: unknown[] = [];
    results.forEach((result, index) => {
      const ticket = tickets[index]!;
      // Un refresco posterior del mismo recurso ya es dueño de su estado.
      if (generations.current[ticket.resource] !== ticket.generation) return;
      if (result.status === 'rejected') {
        if (ticket.resource === 'itemUsage') {
          current.setItemUsageError(mapOperationsError(result.reason));
        } else {
          failures.push(ticket.resource);
          reasons.push(result.reason);
        }
        return;
      }
      const read = result.value;
      switch (read.resource) {
        case 'detail':
          current.setDetail(read.value);
          break;
        case 'activities':
          current.setActivities(read.value.data);
          current.setActivitiesMeta(read.value.meta);
          break;
        case 'itemUsage':
          current.setItemUsage(read.value.data);
          current.setItemUsageMeta(read.value.meta);
          current.setItemUsageError(null);
          break;
        case 'evidence':
          current.setEvidence(read.value.data);
          current.setEvidenceMeta(read.value.meta);
          current.setEvidenceState('available');
          break;
      }
    });

    if (failures.length > 0) {
      current.setError(refreshFailureMessage(failures, reasons));
    }

    // El consumo cambia el saldo: la custodia se relee solo si el acto MATERIAL
    // sigue abierto (CA-11); con la hoja cerrada no se consulta.
    if (mutation === 'consumption' && current.activeConsumptionRequirement.current) {
      current.refreshOpenCustody();
    }
  }, []);
}
