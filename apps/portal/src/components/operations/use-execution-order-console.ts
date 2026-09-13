// apps/portal/src/components/operations/use-execution-order-console.ts
// Extracción verbatim del slice de consola de OT de OperationsClient.tsx
// (estados :393-452, offline :454-464, plantilla :480-483, openExecutionOrder
// :553-714, handlers :804-1117) — split F2 (spec 2026-09-13 §4.5).
//
// El hook conserva los mismos estados, los mismos handlers y el mismo orden.
// Únicos cambios declarados, ambos autorizados por el despacho OLA2:
// 1. El bloque de reset del `onClose` del drawer (:1275-1303) se convierte en
//    `closeExecutionOrder()`, conservando el incremento del seq-ref; la
//    escritura de URL pasa al cliente con `mergeUrlSearchParams` (cierre no
//    destructivo, spec §4.6).
// 2. El efecto de montaje que leía `window.location.search` (:716-725) no se
//    traslada: `ExecutionOrdersClient` lee `useSearchParams()` y dispara
//    `openExecutionOrder` (dictamen G3 §3.3).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ExecutionOrderActivity,
  ExecutionOrderItemUsage,
  ExecutionOrderEvidence,
  InventoryItemStatus,
  StockLocationStatus,
  type ListMeta,
  type RegisterActivityCommand,
} from '@iwana/shared';
import {
  inventoryApi,
  tasksApi,
  type CloseExecutionOrderDto,
  type ExecutionOrderDetailResponse,
  type ExecutorCustodyResponse,
  type RegisterExecutionOrderItemUsageDto,
  type SerializedAssetRecord,
  type StockBalanceRecord,
} from '@/lib/api-client';
import { EMPTY_LIST_META } from '@/lib/list-meta';
import {
  collectExecutionOrderCollectionPages,
  loadMoreExecutionOrderCollection,
} from './execution-order-collections';
import {
  getMissingRequirements,
  isValidFutureEvidenceExpiry,
  mapOperationsError,
  deriveTemplateFromDetail,
  type ExecutionOrderMissingRequirement,
} from './execution-order-requirements';

/** Tamaño de página por defecto del contrato de custodia del ejecutor (§1). */
const EXECUTOR_CUSTODY_PAGE_SIZE = 25;

/**
 * Los ~26 estados de OT + `offline` y los 12 handlers de la consola, extraídos
 * verbatim del monolito. El consumidor (`ExecutionOrdersClient`) monta el
 * `ExecutionOrderDrawer` con este estado y resuelve la URL del deep link.
 */
export function useExecutionOrderConsole() {
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

  const openExecutionOrder = useCallback(async (executionOrderId: string) => {
    const requestSeq = executionOrderRequestSeqRef.current + 1;
    executionOrderRequestSeqRef.current = requestSeq;
    lastAttemptedExecutionOrderIdRef.current = executionOrderId;
    setIsLoadingMoreExecutionOrderActivities(false);
    setIsLoadingMoreExecutionOrderItemUsage(false);
    setIsLoadingMoreExecutionOrderEvidence(false);
    setIsLoadingExecutionOrder(true);
    setExecutionOrderError(null);
    setExecutionOrderSuccess(null);
    setExecutionOrderEvidenceState('loading');
    setExecutionOrderInventoryState('loading');
    setExecutorCustodyState('loading');

    // El detalle es la única llamada crítica; actividades, consumos, evidencias
    // e inventario son concerns independientes y se cargan en paralelo para que
    // el fallo de uno no degrade ni retrase a los demás. La custodia del
    // ejecutor depende del detalle (order.assignee.id) pero viaja en el mismo
    // allSettled reutilizando su promesa, así el guard secuencial la cubre igual.
    const detailPromise = tasksApi.executionOrders.get(executionOrderId);
    const executorCustodyPromise = detailPromise.then((detail) => {
      const assigneeId = detail.assignee?.id;
      if (!assigneeId) {
        return null;
      }
      return inventoryApi.getExecutorCustody(assigneeId, {
        page: 1,
        limit: EXECUTOR_CUSTODY_PAGE_SIZE,
      });
    });
    const [
      orderResult,
      activitiesResult,
      itemUsageResult,
      evidenceResult,
      inventoryResult,
      custodyResult,
    ] = await Promise.allSettled([
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
      Promise.all([
        inventoryApi.listItems({ status: InventoryItemStatus.ACTIVE, limit: 100 }),
        inventoryApi.listLocations({
          custody: 'mobile',
          status: StockLocationStatus.ACTIVE,
          withStock: true,
          limit: 100,
        }),
      ]),
      executorCustodyPromise,
    ]);

    // Respuesta tardía de una apertura/refresh anterior: descartar completa.
    if (executionOrderRequestSeqRef.current !== requestSeq) {
      return;
    }

    if (orderResult.status === 'rejected') {
      setExecutionOrderError(mapOperationsError(orderResult.reason));
      setExecutionOrderEvidenceState('unavailable');
      setExecutionOrderInventoryState('unavailable');
      setExecutorCustodyState('unavailable');
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

    if (inventoryResult.status === 'fulfilled') {
      const [items, locations] = inventoryResult.value;
      setExecutionOrderItemOptions(
        items.data.map((item) => ({ value: item.id, label: `${item.sku} · ${item.name}` })),
      );
      // El backend exige que technicianCustodyId sea el ID del técnico/cuadrilla
      // asignados (assertCustodyAssignment), no el ID de la ubicación; la
      // ubicación móvil aporta el responsable (responsibleRefId).
      setExecutionOrderCustodyOptions(
        locations.data.flatMap((location) =>
          location.responsibleRefId
            ? [
                {
                  type: location.type === 'MOBILE_CREW' ? 'CREW' : 'TECHNICIAN',
                  id: location.responsibleRefId,
                  label: location.name,
                },
              ]
            : [],
        ),
      );
      setExecutionOrderInventoryState('available');
    } else {
      setExecutionOrderItemOptions([]);
      setExecutionOrderCustodyOptions([]);
      setExecutionOrderInventoryState('unavailable');
    }

    // Custodia del ejecutor: disponible, vacía informativa (sin assignee o sin
    // custodia activa) o no disponible con fallback silencioso; un fallo aquí
    // nunca degrada el resto del drawer.
    if (custodyResult.status === 'fulfilled' && custodyResult.value) {
      const custody: ExecutorCustodyResponse = custodyResult.value;
      setExecutorCustodyName(custody.location?.name ?? null);
      setExecutorCustodyAssets(custody.assets.items);
      setExecutorCustodyAssetsMeta(custody.assets.meta);
      setExecutorCustodyBalances(custody.balances.items);
      setExecutorCustodyBalancesMeta(custody.balances.meta);
      setExecutorCustodyState('available');
    } else if (custodyResult.status === 'fulfilled') {
      setExecutorCustodyName(null);
      setExecutorCustodyAssets([]);
      setExecutorCustodyAssetsMeta(EMPTY_LIST_META);
      setExecutorCustodyBalances([]);
      setExecutorCustodyBalancesMeta(EMPTY_LIST_META);
      setExecutorCustodyState('available');
    } else {
      setExecutorCustodyName(null);
      setExecutorCustodyAssets([]);
      setExecutorCustodyAssetsMeta(EMPTY_LIST_META);
      setExecutorCustodyBalances([]);
      setExecutorCustodyBalancesMeta(EMPTY_LIST_META);
      setExecutorCustodyState('unavailable');
    }

    // La plantilla aplicada se deriva del snapshot congelado que viaja en el
    // detalle (DATA-P1-3); no se consulta el catálogo vivo de plantillas.
    setExecutionOrderMissingRequirements([]);
    setIsLoadingExecutionOrder(false);
  }, []);

  async function refreshExecutionOrder(executionOrderId: string) {
    await openExecutionOrder(executionOrderId);
  }

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

  // Paginación compartida del contrato de custodia: page/limit aplican a ambas
  // colecciones, así que un solo onLoadMore avanza equipos y materiales.
  const loadMoreExecutorCustody = useCallback(async () => {
    const assigneeId = selectedExecutionOrder?.assignee?.id;
    if (
      !assigneeId ||
      isLoadingMoreExecutorCustody ||
      (!executorCustodyAssetsMeta.hasMore && !executorCustodyBalancesMeta.hasMore)
    ) {
      return;
    }

    setIsLoadingMoreExecutorCustody(true);
    try {
      const currentPage = executorCustodyAssetsMeta.page ?? executorCustodyBalancesMeta.page ?? 1;
      const nextPage = await inventoryApi.getExecutorCustody(assigneeId, {
        page: currentPage + 1,
        limit: executorCustodyAssetsMeta.limit || EXECUTOR_CUSTODY_PAGE_SIZE,
      });
      setExecutorCustodyAssets((current) => [...current, ...nextPage.assets.items]);
      setExecutorCustodyAssetsMeta(nextPage.assets.meta);
      setExecutorCustodyBalances((current) => [...current, ...nextPage.balances.items]);
      setExecutorCustodyBalancesMeta(nextPage.balances.meta);
    } catch (loadError) {
      setExecutionOrderError(mapOperationsError(loadError));
    } finally {
      setIsLoadingMoreExecutorCustody(false);
    }
  }, [
    executorCustodyAssetsMeta,
    executorCustodyBalancesMeta,
    isLoadingMoreExecutorCustody,
    selectedExecutionOrder?.assignee?.id,
  ]);

  async function handleStartExecutionOrder(note?: string | null) {
    if (!selectedExecutionOrder) return;
    setIsSubmittingExecutionOrder(true);
    setExecutionOrderError(null);
    setExecutionOrderSuccess(null);
    try {
      await tasksApi.executionOrders.start(
        selectedExecutionOrder.id,
        { note: note ?? null },
        selectedExecutionOrder.version,
      );
      await refreshExecutionOrder(selectedExecutionOrder.id);
      setExecutionOrderSuccess('La ejecución fue iniciada.');
    } catch (error) {
      setExecutionOrderError(mapOperationsError(error));
    } finally {
      setIsSubmittingExecutionOrder(false);
    }
  }

  async function handleRegisterExecutionOrderFieldWork(payload: RegisterActivityCommand) {
    if (!selectedExecutionOrder) return false;
    setIsSubmittingExecutionOrder(true);
    setExecutionOrderError(null);
    setExecutionOrderSuccess(null);
    try {
      await tasksApi.executionOrders.registerFieldWork(
        selectedExecutionOrder.id,
        payload,
        selectedExecutionOrder.version,
      );
      await refreshExecutionOrder(selectedExecutionOrder.id);
      setExecutionOrderSuccess('El trabajo realizado fue registrado.');
      return true;
    } catch (error) {
      setExecutionOrderError(mapOperationsError(error));
      return false;
    } finally {
      setIsSubmittingExecutionOrder(false);
    }
  }

  async function handleUpdateExecutionOrderFieldWork(
    activityId: string,
    payload: Partial<RegisterActivityCommand>,
  ) {
    if (!selectedExecutionOrder) return false;
    setIsSubmittingExecutionOrder(true);
    setExecutionOrderError(null);
    setExecutionOrderSuccess(null);
    try {
      await tasksApi.executionOrders.updateFieldWork(
        selectedExecutionOrder.id,
        activityId,
        payload,
        selectedExecutionOrder.version,
      );
      await refreshExecutionOrder(selectedExecutionOrder.id);
      setExecutionOrderSuccess('El trabajo realizado fue actualizado.');
      return true;
    } catch (error) {
      setExecutionOrderError(mapOperationsError(error));
      return false;
    } finally {
      setIsSubmittingExecutionOrder(false);
    }
  }

  async function handleDeleteExecutionOrderFieldWork(activityId: string) {
    if (!selectedExecutionOrder) return false;
    setIsSubmittingExecutionOrder(true);
    setExecutionOrderError(null);
    setExecutionOrderSuccess(null);
    try {
      await tasksApi.executionOrders.deleteFieldWork(
        selectedExecutionOrder.id,
        activityId,
        selectedExecutionOrder.version,
      );
      await refreshExecutionOrder(selectedExecutionOrder.id);
      setExecutionOrderSuccess('El trabajo realizado fue eliminado.');
      return true;
    } catch (error) {
      setExecutionOrderError(mapOperationsError(error));
      return false;
    } finally {
      setIsSubmittingExecutionOrder(false);
    }
  }

  async function handleRegisterExecutionOrderItemUsage(
    payload: RegisterExecutionOrderItemUsageDto,
  ) {
    if (!selectedExecutionOrder) return false;
    setIsSubmittingExecutionOrder(true);
    setExecutionOrderError(null);
    setExecutionOrderSuccess(null);
    try {
      await tasksApi.executionOrders.registerItemUsage(
        selectedExecutionOrder.id,
        payload,
        selectedExecutionOrder.version,
      );
      await refreshExecutionOrder(selectedExecutionOrder.id);
      setExecutionOrderSuccess('El material fue registrado.');
      return true;
    } catch (error) {
      setExecutionOrderError(mapOperationsError(error));
      return false;
    } finally {
      setIsSubmittingExecutionOrder(false);
    }
  }

  async function handleUploadEvidence(file: File, requirementKey: string) {
    if (!selectedExecutionOrder) return false;
    if (!requirementKey.trim()) {
      setExecutionOrderError(
        'No hay un requisito de evidencia válido para asociar el archivo. Actualiza el detalle antes de intentarlo.',
      );
      return false;
    }
    setIsSubmittingExecutionOrder(true);
    setExecutionOrderError(null);
    setExecutionOrderSuccess(null);
    try {
      const uploadReceipt = await tasksApi.executionOrders.uploadEvidenceAsset(
        selectedExecutionOrder.id,
        file,
        selectedExecutionOrder.version,
      );
      if (!isValidFutureEvidenceExpiry(uploadReceipt.expiresAt)) {
        throw new Error('La evidencia subida no tiene una fecha de expiración válida.');
      }
      await tasksApi.executionOrders.registerEvidence(
        selectedExecutionOrder.id,
        {
          mediaAssetId: uploadReceipt.mediaAssetId,
          evidenceType: file.type.startsWith('image/') ? 'PHOTO' : 'DOCUMENT',
          requirementKey,
          expiresAt: uploadReceipt.expiresAt,
        },
        selectedExecutionOrder.version,
      );
      await refreshExecutionOrder(selectedExecutionOrder.id);
      setExecutionOrderSuccess('La evidencia fue registrada.');
      return true;
    } catch (error) {
      setExecutionOrderError(mapOperationsError(error));
      return false;
    } finally {
      setIsSubmittingExecutionOrder(false);
    }
  }

  async function handleCloseExecutionOrder(payload: CloseExecutionOrderDto) {
    if (!selectedExecutionOrder) return;
    setIsSubmittingExecutionOrder(true);
    setExecutionOrderError(null);
    setExecutionOrderSuccess(null);
    try {
      await tasksApi.executionOrders.close(
        selectedExecutionOrder.id,
        payload,
        selectedExecutionOrder.version,
      );
      await refreshExecutionOrder(selectedExecutionOrder.id);
      setExecutionOrderSuccess('El cierre fue registrado.');
    } catch (error) {
      setExecutionOrderError(mapOperationsError(error));
      setExecutionOrderMissingRequirements(getMissingRequirements(error));
    } finally {
      setIsSubmittingExecutionOrder(false);
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
    setIsLoadingMoreExecutorCustody(false);
    setExecutionOrderEvidenceState('available');
    setExecutionOrderInventoryState('loading');
    setExecutorCustodyState('loading');
    setExecutorCustodyName(null);
    setExecutorCustodyAssets([]);
    setExecutorCustodyAssetsMeta(EMPTY_LIST_META);
    setExecutorCustodyBalances([]);
    setExecutorCustodyBalancesMeta(EMPTY_LIST_META);
    setExecutionOrderError(null);
    setExecutionOrderSuccess(null);
    setExecutionOrderItemOptions([]);
    setExecutionOrderCustodyOptions([]);
    setExecutionOrderMissingRequirements([]);
  }, []);

  return {
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
