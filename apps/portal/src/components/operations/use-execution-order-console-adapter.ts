import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ExecutionOrderActivity,
  ExecutionOrderItemUsage,
  ExecutionOrderEvidence,
  type ListMeta,
  type RegisterActivityCommand,
} from '@iwana/shared';
import {
  tasksApi,
  type CloseExecutionOrderDto,
  type ExecutionOrderDetailResponse,
  type RegisterExecutionOrderItemUsageDto,
  type SerializedAssetRecord,
  type StockBalanceRecord,
} from '@/lib/api-client';
import { EMPTY_LIST_META } from '@/lib/list-meta';
import type { RequirementActionDescriptor } from './execution-order-actions';
import {
  collectExecutionOrderCollectionPages,
  loadMoreExecutionOrderCollection,
} from './execution-order-collections';
import {
  getMissingRequirements,
  mapOperationsError,
  deriveTemplateFromDetail,
  type ExecutionOrderMissingRequirement,
} from './execution-order-requirements';
import { useExecutionOrderCustody } from './use-execution-order-custody';
import { useExecutionOrderEvidence } from './use-execution-order-evidence';
import { useExecutionOrderRefresh } from './use-execution-order-refresh';

interface ExecutionOrderMutationContext {
  order: ExecutionOrderDetailResponse;
  requestSequence: number;
}

// apps/portal/src/components/operations/use-execution-order-console-adapter.ts
// Cuerpo del hook de consola de OT, extraído verbatim de OperationsClient.tsx
// (split F2, spec 2026-09-13 §4.5). Lo expone la fachada estable
// `use-execution-order-console.ts`.
//
// B0 (Ola 2b): este adaptador es el único dueño del estado y de la apertura de
// la OT, y delega la POLÍTICA de cada recurso en tres slots con archivo propio,
// para que R2, R3 y R4 los sustituyan sin editar ni este archivo ni la fachada:
//   custodia e inventario -> use-execution-order-custody.ts   (R3)
//   subida de evidencia   -> use-execution-order-evidence.ts  (R2)
//   refresco por mutación -> use-execution-order-refresh.ts   (R4)
// B0 no cambia la política de refetch ni de carga: cada slot trae el
// comportamiento vigente.
//
// Cambios declarados respecto al monolito, autorizados por el despacho OLA2:
// 1. El bloque de reset del `onClose` del drawer (:1275-1303) se convierte en
//    `closeExecutionOrder()`, conservando el incremento del seq-ref; la
//    escritura de URL pasa al cliente con `mergeUrlSearchParams` (cierre no
//    destructivo, spec §4.6).
// 2. El efecto de montaje que leía `window.location.search` (:716-725) no se
//    traslada: `ExecutionOrdersClient` lee `useSearchParams()` y dispara
//    `openExecutionOrder` (dictamen G3 §3.3).
/**
 * Los ~26 estados de OT + `offline` y los 12 handlers de la consola, extraídos
 * verbatim del monolito. El consumidor (`ExecutionOrdersClient`) monta el
 * `ExecutionOrderDrawer` con este estado y resuelve la URL del deep link.
 */
export function useExecutionOrderConsoleAdapter() {
  const [selectedExecutionOrder, setSelectedExecutionOrder] =
    useState<ExecutionOrderDetailResponse | null>(null);
  const [executionOrderActivities, setExecutionOrderActivities] = useState<
    ExecutionOrderActivity[]
  >([]);
  const [executionOrderActivitiesMeta, setExecutionOrderActivitiesMeta] =
    useState<ListMeta>(EMPTY_LIST_META);
  const [executionOrderItemUsage, setExecutionOrderItemUsage] = useState<ExecutionOrderItemUsage[]>(
    [],
  );
  const [executionOrderItemUsageMeta, setExecutionOrderItemUsageMeta] =
    useState<ListMeta>(EMPTY_LIST_META);
  const [executionOrderEvidence, setExecutionOrderEvidence] = useState<ExecutionOrderEvidence[]>(
    [],
  );
  const [executionOrderEvidenceMeta, setExecutionOrderEvidenceMeta] =
    useState<ListMeta>(EMPTY_LIST_META);
  const [executionOrderEvidenceState, setExecutionOrderEvidenceState] = useState<
    'loading' | 'available' | 'unavailable'
  >('available');
  const [executionOrderInventoryState, setExecutionOrderInventoryState] = useState<
    'loading' | 'available' | 'unavailable'
  >('loading');
  // Custodia del ejecutor: misma gramática de estados que el inventario del
  // formulario; alimenta la sub-sección de solo lectura del bloque 4.
  const [executorCustodyState, setExecutorCustodyState] = useState<
    'loading' | 'available' | 'unavailable'
  >('loading');
  const [executorCustodyName, setExecutorCustodyName] = useState<string | null>(null);
  const [executorCustodyAssets, setExecutorCustodyAssets] = useState<SerializedAssetRecord[]>([]);
  const [executorCustodyAssetsMeta, setExecutorCustodyAssetsMeta] =
    useState<ListMeta>(EMPTY_LIST_META);
  const [executorCustodyBalances, setExecutorCustodyBalances] = useState<StockBalanceRecord[]>([]);
  const [executorCustodyBalancesMeta, setExecutorCustodyBalancesMeta] =
    useState<ListMeta>(EMPTY_LIST_META);
  const [isLoadingMoreExecutionOrderActivities, setIsLoadingMoreExecutionOrderActivities] =
    useState(false);
  const [isLoadingMoreExecutionOrderItemUsage, setIsLoadingMoreExecutionOrderItemUsage] =
    useState(false);
  const [isLoadingMoreExecutionOrderEvidence, setIsLoadingMoreExecutionOrderEvidence] =
    useState(false);
  const [isLoadingMoreExecutorCustody, setIsLoadingMoreExecutorCustody] = useState(false);
  const [executionOrderItemOptions, setExecutionOrderItemOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [executionOrderCustodyOptions, setExecutionOrderCustodyOptions] = useState<
    Array<{ type: 'TECHNICIAN' | 'CREW'; id: string; label: string }>
  >([]);
  const [executionOrderMissingRequirements, setExecutionOrderMissingRequirements] = useState<
    ExecutionOrderMissingRequirement[]
  >([]);
  const [executionOrderError, setExecutionOrderError] = useState<string | null>(null);
  const [executionOrderSuccess, setExecutionOrderSuccess] = useState<string | null>(null);
  const [isLoadingExecutionOrder, setIsLoadingExecutionOrder] = useState(false);
  const [isSubmittingExecutionOrder, setIsSubmittingExecutionOrder] = useState(false);
  const [isAnalyzingEvidence, setIsAnalyzingEvidence] = useState(false);
  const [offline, setOffline] = useState(false);
  // Contador secuencial: descarta respuestas tardías de aperturas/refresh previos
  // para que no reabran el drawer ni pisen el estado de la OT vigente.
  const executionOrderRequestSeqRef = useRef(0);
  // PROD-UX #3 (OLA 4.1): último identificador intentado. El reintento del
  // drawer debe reutilizarlo cuando el detalle no llegó a cargar
  // (`selectedExecutionOrder` es null y el botón quedaba inerte).
  const lastAttemptedExecutionOrderIdRef = useRef<string | null>(null);

  useEffect(() => {
    const updateConnectionState = () => setOffline(!navigator.onLine);
    updateConnectionState();
    window.addEventListener('online', updateConnectionState);
    window.addEventListener('offline', updateConnectionState);

    return () => {
      window.removeEventListener('online', updateConnectionState);
      window.removeEventListener('offline', updateConnectionState);
    };
  }, []);

  const executionOrderTemplate = useMemo(
    () => deriveTemplateFromDetail(selectedExecutionOrder),
    [selectedExecutionOrder],
  );

  const activeConsumptionRequirement = useRef<RequirementActionDescriptor | null>(null);
  const custody = useExecutionOrderCustody({
    selectedExecutionOrder,
    requestSequence: executionOrderRequestSeqRef,
    setInventoryState: setExecutionOrderInventoryState,
    setCustodyState: setExecutorCustodyState,
    setCustodyName: setExecutorCustodyName,
    setAssets: setExecutorCustodyAssets,
    setAssetsMeta: setExecutorCustodyAssetsMeta,
    setBalances: setExecutorCustodyBalances,
    setBalancesMeta: setExecutorCustodyBalancesMeta,
    setItemOptions: setExecutionOrderItemOptions,
    setCustodyOptions: setExecutionOrderCustodyOptions,
    setError: setExecutionOrderError,
    assetsMeta: executorCustodyAssetsMeta,
    balancesMeta: executorCustodyBalancesMeta,
    isLoadingMore: isLoadingMoreExecutorCustody,
    setLoadingMore: setIsLoadingMoreExecutorCustody,
  });
  const openRequirementAction = (action: RequirementActionDescriptor | null) => {
    setExecutionOrderError(null);
    setExecutionOrderSuccess(null);
    activeConsumptionRequirement.current = action?.kind === 'consumption' ? action : null;
    custody.openAction(action);
  };
  const beginExecutionOrderMutation = (): ExecutionOrderMutationContext | null => {
    if (!selectedExecutionOrder) return null;
    setIsSubmittingExecutionOrder(true);
    setExecutionOrderError(null);
    setExecutionOrderSuccess(null);
    return {
      order: selectedExecutionOrder,
      requestSequence: executionOrderRequestSeqRef.current,
    };
  };
  const isCurrentExecutionOrderMutation = (context: ExecutionOrderMutationContext) =>
    executionOrderRequestSeqRef.current === context.requestSequence;

  const openExecutionOrder = useCallback(
    async (executionOrderId: string) => {
      const requestSeq = executionOrderRequestSeqRef.current + 1;
      executionOrderRequestSeqRef.current = requestSeq;
      lastAttemptedExecutionOrderIdRef.current = executionOrderId;
      setIsLoadingMoreExecutionOrderActivities(false);
      setIsLoadingMoreExecutionOrderItemUsage(false);
      setIsLoadingMoreExecutionOrderEvidence(false);
      setIsSubmittingExecutionOrder(false);
      setIsAnalyzingEvidence(false);
      setIsLoadingExecutionOrder(true);
      setExecutionOrderError(null);
      setExecutionOrderSuccess(null);
      setExecutionOrderEvidenceState('loading');

      // El detalle es la única llamada crítica; actividades, consumos, evidencias
      // e inventario son concerns independientes y se cargan en paralelo para que
      // el fallo de uno no degrade ni retrase a los demás. La carga de inventario
      // y custodia es política del slot de custodia (R3): viaja en el mismo
      // allSettled y devuelve la función que aplica su resultado, así el guard
      // secuencial la cubre igual y el estado se confirma en un único lote.
      const detailPromise = tasksApi.executionOrders.get(executionOrderId);
      const [orderResult, activitiesResult, itemUsageResult, evidenceResult, custodyLoadResult] =
        await Promise.allSettled([
          detailPromise,
          collectExecutionOrderCollectionPages((page, limit) =>
            tasksApi.executionOrders.listActivities(executionOrderId, { page, limit }),
          ),
          collectExecutionOrderCollectionPages((page, limit) =>
            tasksApi.executionOrders.listItemUsage(executionOrderId, { page, limit }),
          ),
          collectExecutionOrderCollectionPages((page, limit) =>
            tasksApi.executionOrders.listEvidence(executionOrderId, { page, limit }),
          ),
          custody.loadOnOpen(detailPromise),
        ]);

      // Respuesta tardía de una apertura/refresh anterior: descartar completa.
      if (executionOrderRequestSeqRef.current !== requestSeq) {
        return;
      }

      if (orderResult.status === 'rejected') {
        setExecutionOrderError(mapOperationsError(orderResult.reason));
        setExecutionOrderEvidenceState('unavailable');
        custody.markUnavailable();
        setIsLoadingExecutionOrder(false);
        return;
      }

      const detail = orderResult.value;
      setSelectedExecutionOrder(detail);

      if (activitiesResult.status === 'fulfilled') {
        setExecutionOrderActivities(activitiesResult.value.data);
        setExecutionOrderActivitiesMeta(activitiesResult.value.meta);
      } else {
        setExecutionOrderActivities([]);
        setExecutionOrderActivitiesMeta(EMPTY_LIST_META);
      }

      if (itemUsageResult.status === 'fulfilled') {
        setExecutionOrderItemUsage(itemUsageResult.value.data);
        setExecutionOrderItemUsageMeta(itemUsageResult.value.meta);
      } else {
        setExecutionOrderItemUsage([]);
        setExecutionOrderItemUsageMeta(EMPTY_LIST_META);
      }

      if (evidenceResult.status === 'fulfilled') {
        setExecutionOrderEvidence(evidenceResult.value.data);
        setExecutionOrderEvidenceMeta(evidenceResult.value.meta);
        setExecutionOrderEvidenceState('available');
      } else {
        setExecutionOrderEvidence([]);
        setExecutionOrderEvidenceMeta(EMPTY_LIST_META);
        setExecutionOrderEvidenceState('unavailable');
      }

      if (custodyLoadResult.status === 'fulfilled') {
        custodyLoadResult.value();
      } else {
        custody.markUnavailable();
      }

      // La plantilla aplicada se deriva del snapshot congelado que viaja en el
      // detalle (DATA-P1-3); no se consulta el catálogo vivo de plantillas.
      setExecutionOrderMissingRequirements([]);
      setIsLoadingExecutionOrder(false);
    },
    [custody],
  );

  const refreshExecutionOrder = useExecutionOrderRefresh({
    openExecutionOrder,
    selectedExecutionOrder,
    setDetail: setSelectedExecutionOrder,
    setActivities: setExecutionOrderActivities,
    setActivitiesMeta: setExecutionOrderActivitiesMeta,
    setItemUsage: setExecutionOrderItemUsage,
    setItemUsageMeta: setExecutionOrderItemUsageMeta,
    setEvidence: setExecutionOrderEvidence,
    setEvidenceMeta: setExecutionOrderEvidenceMeta,
    requestSequence: executionOrderRequestSeqRef,
    setError: setExecutionOrderError,
    setLoadingDetail: setIsLoadingExecutionOrder,
    setEvidenceState: setExecutionOrderEvidenceState,
    setLoadingActivities: setIsLoadingMoreExecutionOrderActivities,
    setLoadingItemUsage: setIsLoadingMoreExecutionOrderItemUsage,
    setLoadingEvidence: setIsLoadingMoreExecutionOrderEvidence,
    setSuccess: setExecutionOrderSuccess,
    activeConsumptionRequirement,
    refreshOpenCustody: () => custody.openAction(activeConsumptionRequirement.current),
  });

  const loadMoreExecutionOrderActivities = useCallback(async () => {
    const executionOrderId = selectedExecutionOrder?.id;
    if (
      !executionOrderId ||
      !executionOrderActivitiesMeta.hasMore ||
      isLoadingMoreExecutionOrderActivities
    ) {
      return;
    }

    setIsLoadingMoreExecutionOrderActivities(true);
    try {
      const nextPage = await loadMoreExecutionOrderCollection(
        (page, limit) => tasksApi.executionOrders.listActivities(executionOrderId, { page, limit }),
        executionOrderActivitiesMeta,
        executionOrderActivities.length,
      );
      setExecutionOrderActivities((current) => [...current, ...nextPage.data]);
      setExecutionOrderActivitiesMeta(nextPage.meta);
    } catch (loadError) {
      setExecutionOrderError(mapOperationsError(loadError));
    } finally {
      setIsLoadingMoreExecutionOrderActivities(false);
    }
  }, [
    executionOrderActivities,
    executionOrderActivitiesMeta,
    isLoadingMoreExecutionOrderActivities,
    selectedExecutionOrder?.id,
  ]);

  const loadMoreExecutionOrderItemUsage = useCallback(async () => {
    const executionOrderId = selectedExecutionOrder?.id;
    if (
      !executionOrderId ||
      !executionOrderItemUsageMeta.hasMore ||
      isLoadingMoreExecutionOrderItemUsage
    ) {
      return;
    }

    setIsLoadingMoreExecutionOrderItemUsage(true);
    try {
      const nextPage = await loadMoreExecutionOrderCollection(
        (page, limit) => tasksApi.executionOrders.listItemUsage(executionOrderId, { page, limit }),
        executionOrderItemUsageMeta,
        executionOrderItemUsage.length,
      );
      setExecutionOrderItemUsage((current) => [...current, ...nextPage.data]);
      setExecutionOrderItemUsageMeta(nextPage.meta);
    } catch (loadError) {
      setExecutionOrderError(mapOperationsError(loadError));
    } finally {
      setIsLoadingMoreExecutionOrderItemUsage(false);
    }
  }, [
    executionOrderItemUsage,
    executionOrderItemUsageMeta,
    isLoadingMoreExecutionOrderItemUsage,
    selectedExecutionOrder?.id,
  ]);

  const loadMoreExecutionOrderEvidence = useCallback(async () => {
    const executionOrderId = selectedExecutionOrder?.id;
    if (
      !executionOrderId ||
      !executionOrderEvidenceMeta.hasMore ||
      isLoadingMoreExecutionOrderEvidence
    ) {
      return;
    }

    setIsLoadingMoreExecutionOrderEvidence(true);
    try {
      const nextPage = await loadMoreExecutionOrderCollection(
        (page, limit) => tasksApi.executionOrders.listEvidence(executionOrderId, { page, limit }),
        executionOrderEvidenceMeta,
        executionOrderEvidence.length,
      );
      setExecutionOrderEvidence((current) => [...current, ...nextPage.data]);
      setExecutionOrderEvidenceMeta(nextPage.meta);
    } catch (loadError) {
      setExecutionOrderError(mapOperationsError(loadError));
    } finally {
      setIsLoadingMoreExecutionOrderEvidence(false);
    }
  }, [
    executionOrderEvidence,
    executionOrderEvidenceMeta,
    isLoadingMoreExecutionOrderEvidence,
    selectedExecutionOrder?.id,
  ]);

  const retryExecutionOrder = useCallback(async () => {
    // Reutiliza el identificador intentado: con el detalle sin cargar
    // (`selectedExecutionOrder` null) el botón del drawer quedaba inerte.
    const executionOrderId = selectedExecutionOrder?.id ?? lastAttemptedExecutionOrderIdRef.current;
    if (executionOrderId) {
      await openExecutionOrder(executionOrderId);
    }
  }, [selectedExecutionOrder?.id, openExecutionOrder]);

  const loadMoreExecutorCustody = useCallback(() => custody.loadMore(), [custody]);

  async function handleStartExecutionOrder(note?: string | null) {
    const context = beginExecutionOrderMutation();
    if (!context) return;
    try {
      await tasksApi.executionOrders.start(
        context.order.id,
        { note: note ?? null },
        context.order.version,
      );
      await refreshExecutionOrder(context.order.id, 'start');
      if (isCurrentExecutionOrderMutation(context)) {
        setExecutionOrderSuccess('La ejecución fue iniciada.');
      }
    } catch (error) {
      if (isCurrentExecutionOrderMutation(context)) {
        setExecutionOrderError(mapOperationsError(error));
      }
    } finally {
      if (isCurrentExecutionOrderMutation(context)) setIsSubmittingExecutionOrder(false);
    }
  }

  async function handleRegisterExecutionOrderFieldWork(payload: RegisterActivityCommand) {
    const context = beginExecutionOrderMutation();
    if (!context) return false;
    try {
      await tasksApi.executionOrders.registerFieldWork(
        context.order.id,
        payload,
        context.order.version,
      );
      await refreshExecutionOrder(context.order.id, 'activity');
      if (isCurrentExecutionOrderMutation(context)) {
        setExecutionOrderSuccess('El trabajo realizado fue registrado.');
        return true;
      }
      return false;
    } catch (error) {
      if (isCurrentExecutionOrderMutation(context)) {
        setExecutionOrderError(mapOperationsError(error));
      }
      return false;
    } finally {
      if (isCurrentExecutionOrderMutation(context)) setIsSubmittingExecutionOrder(false);
    }
  }

  async function handleUpdateExecutionOrderFieldWork(
    activityId: string,
    payload: Partial<RegisterActivityCommand>,
  ) {
    const context = beginExecutionOrderMutation();
    if (!context) return false;
    try {
      await tasksApi.executionOrders.updateFieldWork(
        context.order.id,
        activityId,
        payload,
        context.order.version,
      );
      await refreshExecutionOrder(context.order.id, 'activity');
      if (isCurrentExecutionOrderMutation(context)) {
        setExecutionOrderSuccess('El trabajo realizado fue actualizado.');
        return true;
      }
      return false;
    } catch (error) {
      if (isCurrentExecutionOrderMutation(context)) {
        setExecutionOrderError(mapOperationsError(error));
      }
      return false;
    } finally {
      if (isCurrentExecutionOrderMutation(context)) setIsSubmittingExecutionOrder(false);
    }
  }

  async function handleDeleteExecutionOrderFieldWork(activityId: string) {
    const context = beginExecutionOrderMutation();
    if (!context) return false;
    try {
      await tasksApi.executionOrders.deleteFieldWork(
        context.order.id,
        activityId,
        context.order.version,
      );
      await refreshExecutionOrder(context.order.id, 'activity');
      if (isCurrentExecutionOrderMutation(context)) {
        setExecutionOrderSuccess('El trabajo realizado fue eliminado.');
        return true;
      }
      return false;
    } catch (error) {
      if (isCurrentExecutionOrderMutation(context)) {
        setExecutionOrderError(mapOperationsError(error));
      }
      return false;
    } finally {
      if (isCurrentExecutionOrderMutation(context)) setIsSubmittingExecutionOrder(false);
    }
  }

  async function handleRegisterExecutionOrderItemUsage(
    payload: RegisterExecutionOrderItemUsageDto,
  ) {
    const context = beginExecutionOrderMutation();
    if (!context) return false;
    try {
      await tasksApi.executionOrders.registerItemUsage(
        context.order.id,
        payload,
        context.order.version,
      );
      await refreshExecutionOrder(context.order.id, 'consumption');
      if (isCurrentExecutionOrderMutation(context)) {
        setExecutionOrderSuccess('El material fue registrado.');
        return true;
      }
      return false;
    } catch (error) {
      if (isCurrentExecutionOrderMutation(context)) {
        setExecutionOrderError(mapOperationsError(error));
      }
      return false;
    } finally {
      if (isCurrentExecutionOrderMutation(context)) setIsSubmittingExecutionOrder(false);
    }
  }

  const handleUploadEvidence = useExecutionOrderEvidence({
    selectedExecutionOrder,
    requestSequence: executionOrderRequestSeqRef,
    setIsSubmittingExecutionOrder,
    setIsAnalyzingEvidence,
    setExecutionOrderError,
    setExecutionOrderSuccess,
    refreshExecutionOrder,
  });

  async function handleCloseExecutionOrder(payload: CloseExecutionOrderDto) {
    const context = beginExecutionOrderMutation();
    if (!context) return;
    try {
      await tasksApi.executionOrders.close(context.order.id, payload, context.order.version);
      await refreshExecutionOrder(context.order.id, 'close');
      if (isCurrentExecutionOrderMutation(context)) {
        setExecutionOrderSuccess('El cierre fue registrado.');
      }
    } catch (error) {
      if (isCurrentExecutionOrderMutation(context)) {
        setExecutionOrderError(mapOperationsError(error));
        setExecutionOrderMissingRequirements(getMissingRequirements(error));
      }
    } finally {
      if (isCurrentExecutionOrderMutation(context)) setIsSubmittingExecutionOrder(false);
    }
  }

  /**
   * Reset del drawer convertido desde el `onClose` del monolito
   * (OperationsClient.tsx:1275-1303). Conserva el incremento del seq-ref para
   * que una respuesta tardía no reabra el drawer; la escritura de URL
   * (cierre no destructivo con `mergeUrlSearchParams`) la resuelve el cliente.
   */
  const closeExecutionOrder = useCallback(() => {
    // Invalida cualquier apertura/refresh en vuelo para que una respuesta
    // tardía no reabra el drawer con estado stale.
    executionOrderRequestSeqRef.current += 1;
    activeConsumptionRequirement.current = null;
    setSelectedExecutionOrder(null);
    setExecutionOrderActivities([]);
    setExecutionOrderActivitiesMeta(EMPTY_LIST_META);
    setExecutionOrderItemUsage([]);
    setExecutionOrderItemUsageMeta(EMPTY_LIST_META);
    setExecutionOrderEvidence([]);
    setExecutionOrderEvidenceMeta(EMPTY_LIST_META);
    setIsLoadingMoreExecutionOrderActivities(false);
    setIsLoadingMoreExecutionOrderItemUsage(false);
    setIsLoadingMoreExecutionOrderEvidence(false);
    custody.reset();
    setExecutionOrderEvidenceState('available');
    setIsSubmittingExecutionOrder(false);
    setIsAnalyzingEvidence(false);
    setExecutionOrderError(null);
    setExecutionOrderSuccess(null);
    setExecutionOrderMissingRequirements([]);
  }, [custody]);

  return {
    openRequirementAction,
    selectedExecutionOrder,
    executionOrderActivities,
    executionOrderActivitiesMeta,
    executionOrderItemUsage,
    executionOrderItemUsageMeta,
    executionOrderEvidence,
    executionOrderEvidenceMeta,
    executionOrderEvidenceState,
    executionOrderInventoryState,
    executorCustodyState,
    executorCustodyName,
    executorCustodyAssets,
    executorCustodyAssetsMeta,
    executorCustodyBalances,
    executorCustodyBalancesMeta,
    isLoadingMoreExecutionOrderActivities,
    isLoadingMoreExecutionOrderItemUsage,
    isLoadingMoreExecutionOrderEvidence,
    isLoadingMoreExecutorCustody,
    executionOrderTemplate,
    executionOrderItemOptions,
    executionOrderCustodyOptions,
    executionOrderMissingRequirements,
    executionOrderError,
    executionOrderSuccess,
    isLoadingExecutionOrder,
    isSubmittingExecutionOrder,
    isAnalyzingEvidence,
    offline,
    openExecutionOrder,
    retryExecutionOrder,
    loadMoreExecutionOrderActivities,
    loadMoreExecutionOrderItemUsage,
    loadMoreExecutionOrderEvidence,
    loadMoreExecutorCustody,
    handleStartExecutionOrder,
    handleRegisterExecutionOrderFieldWork,
    handleUpdateExecutionOrderFieldWork,
    handleDeleteExecutionOrderFieldWork,
    handleRegisterExecutionOrderItemUsage,
    handleUploadEvidence,
    handleCloseExecutionOrder,
    closeExecutionOrder,
  };
}
