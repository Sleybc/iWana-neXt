// apps/portal/src/components/operations/ExecutionOrdersClient.tsx
// Cliente de la sub-ruta /dashboard/operations/execution-orders. En F5 se
// cablea la bandeja de OT contra el endpoint real `GET /tasks/execution-orders`
// (contrato congelado `execution-orders-list.ts` v1): página, tamaño, filtros
// y detalle en la URL (ADR-065 §9, vía `execution-orders-query.ts`), pie
// elegido por `meta.capabilities.randomAccess` (un solo pie, contrato de
// componente §5) y estados completos (skeleton con forma, vacíos E4/E5 con
// acción de la UX spec §6.2, error con reintento).
// La consola de la OT (hook extraído verbatim en F2 + `ExecutionOrderDrawer`)
// se conserva: mantiene vivos los deep links `?executionOrderId=` legados vía
// el despachador de la raíz (restricción 8 de F5).
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@iwana/ui';
import { UserRole } from '@iwana/shared';
import type { ExecutionOrderListItem, ListExecutionOrdersQuery } from '@/lib/api-client';
import { tasksApi } from '@/lib/api-client';
import type { ListMeta } from '@iwana/shared';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSectionHeader,
} from '@/components/shared/portal-ui';
import { useAuth } from '@/components/auth/AuthProvider';
import { EMPTY_LIST_META, listPageWindow, normalizeListMeta } from '@/lib/list-meta';
import { PORTAL_DEFAULT_PAGE_SIZE } from '@/lib/portal-page-size';
import { mergeUrlSearchParams, withSearchParams } from '@/lib/merge-url-search-params';
import { ExecutionOrderDrawer } from './ExecutionOrderDrawer';
import { ExecutionOrdersTable } from './ExecutionOrdersTable';
import { ExecutionOrdersToolbar } from './ExecutionOrdersToolbar';
import { useExecutionOrderConsole } from './use-execution-order-console';
import { mapOperationsError } from './execution-order-requirements';
import {
  parseExecutionOrdersQuery,
  serializeExecutionOrdersQuery,
  type ExecutionOrdersQueryPatch,
} from './execution-orders-query';

const EXECUTION_ORDERS_PATH = '/dashboard/operations/execution-orders';

/** El backend exige ISO 8601 datetime (`z.string().datetime()`); la URL guarda
 * fecha-only (YYYY-MM-DD) y la conversión es local y determinista. */
function windowDateToIso(value: string, boundary: 'start' | 'end'): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(
      `${value}${boundary === 'start' ? 'T00:00:00' : 'T23:59:59.999'}`,
    ).toISOString();
  }
  return value;
}

function buildExecutionOrdersListParams(
  query: ListExecutionOrdersQuery,
  page: number,
  limit: number,
): ListExecutionOrdersQuery {
  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.result ? { result: query.result } : {}),
    ...(query.workType ? { workType: query.workType } : {}),
    ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
    ...(query.organizationSiteId ? { organizationSiteId: query.organizationSiteId } : {}),
    ...(query.ticketId ? { ticketId: query.ticketId } : {}),
    ...(query.taskId ? { taskId: query.taskId } : {}),
    ...(query.visitRequestId ? { visitRequestId: query.visitRequestId } : {}),
    ...(query.windowFrom ? { windowFrom: windowDateToIso(query.windowFrom, 'start') } : {}),
    ...(query.windowTo ? { windowTo: windowDateToIso(query.windowTo, 'end') } : {}),
    page,
    limit,
  };
}

export function ExecutionOrdersClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const orderConsole = useExecutionOrderConsole();
  const { openExecutionOrder, closeExecutionOrder } = orderConsole;
  const executionOrderId = searchParams.get('executionOrderId');

  // ── Bandeja de OT (F5) ────────────────────────────────────────────────────
  const [orders, setOrders] = useState<ExecutionOrderListItem[]>([]);
  const [ordersMeta, setOrdersMeta] = useState<ListMeta>(EMPTY_LIST_META);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRequestRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const metaRef = useRef<ListMeta>(EMPTY_LIST_META);
  // PROD-UX #7 (OLA 4.1): al cerrar por deep link no hay disparador de fila
  // al que devolver el foco; el contenedor lo lleva al encabezado de la región
  // de resultados. La apertura por fila conserva el retorno al disparador.
  const resultsHeaderRef = useRef<HTMLDivElement | null>(null);
  const openedFromRowRef = useRef(false);

  // La query se deriva del STRING de la URL (no de la identidad del objeto
  // `useSearchParams()`), de modo que un re-render sin navegación no
  // reinicia la carga.
  const searchString = searchParams.toString();
  const query = useMemo(
    () => parseExecutionOrdersQuery(new URLSearchParams(searchString)),
    [searchString],
  );

  const loadOrders = useCallback(
    async (options?: { append?: boolean }) => {
      const append = options?.append === true;
      const currentPage = metaRef.current.page ?? 1;
      const nextPage = append ? currentPage + 1 : (query.page ?? 1);
      const limit = metaRef.current.limit || query.limit || PORTAL_DEFAULT_PAGE_SIZE;
      const requestId = ++listRequestRef.current;

      if (append) {
        setIsLoadingMore(true);
      } else if (hasLoadedRef.current) {
        setIsRefreshing(true);
      }
      setError(null);
      try {
        const response = await tasksApi.executionOrders.list(
          buildExecutionOrdersListParams(query, nextPage, limit),
        );
        if (requestId !== listRequestRef.current) {
          return;
        }
        const meta = normalizeListMeta(response.meta, {
          dataLength: response.data.length,
          limit,
        });
        metaRef.current = meta;
        setOrdersMeta(meta);
        setOrders((prev) => (append ? [...prev, ...response.data] : response.data));
        hasLoadedRef.current = true;
      } catch (loadError) {
        if (requestId !== listRequestRef.current) {
          return;
        }
        setError(mapOperationsError(loadError));
        // Contrato de componente v1.1 §6.7: la tabla conserva el último dato
        // válido. Solo se limpia la grilla cuando nunca hubo una carga exitosa:
        // sin filas previas el error sustituye a la composición vacía.
        if (!append && !hasLoadedRef.current) {
          metaRef.current = EMPTY_LIST_META;
          setOrdersMeta(EMPTY_LIST_META);
          setOrders([]);
        }
      } finally {
        if (requestId === listRequestRef.current) {
          setIsLoadingMore(false);
          setIsRefreshing(false);
          setIsLoading(false);
        }
      }
    },
    [query],
  );

  // Carga (y recarga) al cambiar el estado de la URL. El append del modo
  // «Cargar más» es explícito: no participa de este efecto.
  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  /** Escribe la bandeja en la URL preservando el deep link del detalle. */
  const updateQuery = useCallback(
    (patch: ExecutionOrdersQueryPatch, history: 'push' | 'replace') => {
      const serialized = serializeExecutionOrdersQuery({ ...query, ...patch });
      const nextSearch = executionOrderId
        ? mergeUrlSearchParams(serialized, { executionOrderId })
        : serialized;
      const href = withSearchParams(EXECUTION_ORDERS_PATH, nextSearch);
      if (history === 'push') {
        router.push(href, { scroll: false });
      } else {
        router.replace(href, { scroll: false });
      }
    },
    [executionOrderId, query, router],
  );

  // ADR-065 §9: página → push (Atrás vuelve); filtro/tamaño → replace + página 1.
  const handleFilterChange = useCallback(
    (patch: ExecutionOrdersQueryPatch) => {
      updateQuery({ ...patch, page: undefined }, 'replace');
    },
    [updateQuery],
  );
  const handlePageChange = useCallback(
    (page: number) => {
      updateQuery({ page }, 'push');
    },
    [updateQuery],
  );
  const handlePageSizeChange = useCallback(
    (size: number) => {
      updateQuery({ limit: size, page: undefined }, 'replace');
    },
    [updateQuery],
  );
  const handleClearFilters = useCallback(() => {
    updateQuery(
      {
        status: undefined,
        result: undefined,
        workType: undefined,
        assigneeId: undefined,
        organizationSiteId: undefined,
        windowFrom: undefined,
        windowTo: undefined,
        page: undefined,
      },
      'replace',
    );
  }, [updateQuery]);

  // Receta del contrato §5: el modo lo calcula el contenedor desde `meta`.
  const randomAccess = ordersMeta.capabilities.randomAccess === true;
  const pageCount = ordersMeta.totalPages ?? (ordersMeta.total > 0 ? 1 : 0);
  const effectivePage = ordersMeta.page ?? query.page ?? 1;
  const pageSize = ordersMeta.limit || query.limit || PORTAL_DEFAULT_PAGE_SIZE;
  const { from, to } = listPageWindow({
    page: effectivePage,
    limit: pageSize,
    total: ordersMeta.total,
  });

  const handleOpenRow = useCallback(
    (order: ExecutionOrderListItem) => {
      openedFromRowRef.current = true;
      // El detalle se abre por URL (spec §4.6): la fila solo escribe el
      // parámetro; el efecto del deep link resuelve la consola.
      const nextSearch = mergeUrlSearchParams(searchParams, { executionOrderId: order.id });
      router.push(withSearchParams(EXECUTION_ORDERS_PATH, nextSearch), { scroll: false });
    },
    [router, searchParams],
  );

  const hasActiveFilters = Boolean(
    query.status ||
    query.result ||
    query.workType ||
    query.assigneeId ||
    query.organizationSiteId ||
    query.windowFrom ||
    query.windowTo,
  );

  // E6 (UX spec §6.3): el enlace llegó con un identificador que no se pudo
  // abrir. La alerta la compone el contenedor —no el drawer— con la salida a la
  // bandeja por defecto; mismo patrón que E7 en la bandeja de tareas.
  const deepLinkFailed =
    Boolean(executionOrderId) &&
    !orderConsole.selectedExecutionOrder &&
    !orderConsole.isLoadingExecutionOrder &&
    Boolean(orderConsole.executionOrderError);

  const isFieldRole = user?.role === UserRole.TECHNICIAN || user?.role === UserRole.CONTRACTOR;
  const assigneeLabel =
    orders.find((order) => order.assignee?.id === query.assigneeId)?.assignee?.displayLabel ?? null;

  const pagination = randomAccess
    ? {
        randomAccess: true as const,
        page: effectivePage,
        pageCount,
        pageSize,
        onPageChange: handlePageChange,
        onPageSizeChange: handlePageSizeChange,
      }
    : {
        randomAccess: false as const,
        hasMore: ordersMeta.hasMore,
        onLoadMore: () => void loadOrders({ append: true }),
      };

  // Deep link: el monolito leía `window.location.search` al montar
  // (OperationsClient.tsx:716-725); aquí el mismo disparo pasa a leer
  // `useSearchParams()` (dictamen G3 §3.3). El hook no cambia.
  useEffect(() => {
    if (executionOrderId) {
      void openExecutionOrder(executionOrderId);
    }
  }, [executionOrderId, openExecutionOrder]);

  return (
    <div className="space-y-6">
      {error && (
        <PortalAlert
          variant="error"
          title="No pudimos cargar la información"
          description={error}
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => void loadOrders()}>
              Reintentar
            </Button>
          }
        />
      )}

      {deepLinkFailed && (
        <PortalAlert
          variant="error"
          title="No pudimos abrir esta orden de ejecución"
          description="El enlace puede estar desactualizado o el elemento puede no estar disponible para ti."
          action={
            <Button asChild={true} variant="secondary" size="sm">
              <Link href={EXECUTION_ORDERS_PATH}>Ver todas las órdenes de ejecución</Link>
            </Button>
          }
        />
      )}

      <PortalPanel
        eyebrow="Seguimiento"
        title="Bandeja de órdenes de ejecución"
        description="Filtra el trabajo de campo por estado, responsable, sede o ventana planificada y abre la consola de cada orden."
      >
        <div className="space-y-4">
          {/* Encabezado de la región de resultados: destino de foco al cerrar
              el detalle llegado por deep link (PROD-UX #7, UX spec §8.2.2). */}
          <div
            id="execution-orders-results"
            ref={resultsHeaderRef}
            tabIndex={-1}
            className="rounded-2xl focus:outline-none"
          >
            <PortalSectionHeader
              title="Órdenes de ejecución"
              description="El orden por defecto muestra primero la ventana planificada más reciente."
            />
          </div>

          <ExecutionOrdersToolbar
            filters={query}
            onFilterChange={handleFilterChange}
            onClearFilters={handleClearFilters}
            onRefresh={() => void loadOrders()}
            isRefreshing={isRefreshing}
            assigneeLabel={assigneeLabel}
          />

          {/* Carga inicial: filas skeleton con forma de tabla dentro del shell
              (contrato de componente §6.5); sin datos reales aún. */}
          {!isLoading && orders.length === 0 ? (
            /* El error no co-renderiza el vacío (§6.7): sin filas previas, la
               alerta superior ES el estado de la bandeja. */
            error ? null : hasActiveFilters ? (
              <PortalEmptyState
                title="No hay órdenes con estos filtros"
                description="Prueba con otros filtros o límpialos para ver todas las órdenes."
                action={
                  <Button type="button" variant="outline" size="sm" onClick={handleClearFilters}>
                    Limpiar filtros
                  </Button>
                }
              />
            ) : (
              <PortalEmptyState
                title="Todavía no hay órdenes de ejecución"
                description={
                  isFieldRole
                    ? 'Cuando te asignen una orden de ejecución, la verás aquí.'
                    : 'Las órdenes nacen de las visitas programadas. Cuando Programación agende una visita, su orden aparecerá aquí.'
                }
                action={
                  isFieldRole ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void loadOrders()}
                    >
                      Actualizar
                    </Button>
                  ) : (
                    <Button asChild={true} variant="secondary" size="sm">
                      <Link href="/dashboard/scheduling">Ir a Programación</Link>
                    </Button>
                  )
                }
              />
            )
          ) : (
            <ExecutionOrdersTable
              orders={orders}
              total={ordersMeta.total}
              isLoading={isLoading}
              refreshing={isRefreshing || isLoadingMore}
              from={from}
              to={to}
              onOpenRow={handleOpenRow}
              activeRowId={executionOrderId}
              pagination={pagination}
            />
          )}
        </div>
      </PortalPanel>

      <ExecutionOrderDrawer
        open={Boolean(orderConsole.selectedExecutionOrder) || orderConsole.isLoadingExecutionOrder}
        order={orderConsole.selectedExecutionOrder}
        activities={orderConsole.executionOrderActivities}
        activitiesMeta={orderConsole.executionOrderActivitiesMeta}
        itemUsage={orderConsole.executionOrderItemUsage}
        itemUsageMeta={orderConsole.executionOrderItemUsageMeta}
        evidence={orderConsole.executionOrderEvidence}
        evidenceMeta={orderConsole.executionOrderEvidenceMeta}
        isLoadingMoreActivities={orderConsole.isLoadingMoreExecutionOrderActivities}
        isLoadingMoreItemUsage={orderConsole.isLoadingMoreExecutionOrderItemUsage}
        isLoadingMoreEvidence={orderConsole.isLoadingMoreExecutionOrderEvidence}
        onLoadMoreActivities={orderConsole.loadMoreExecutionOrderActivities}
        onLoadMoreItemUsage={orderConsole.loadMoreExecutionOrderItemUsage}
        onLoadMoreEvidence={orderConsole.loadMoreExecutionOrderEvidence}
        evidenceState={orderConsole.executionOrderEvidenceState}
        itemsState={orderConsole.executionOrderInventoryState}
        executorCustodyState={orderConsole.executorCustodyState}
        executorCustodyName={orderConsole.executorCustodyName}
        executorCustodyAssets={orderConsole.executorCustodyAssets}
        executorCustodyAssetsMeta={orderConsole.executorCustodyAssetsMeta}
        executorCustodyBalances={orderConsole.executorCustodyBalances}
        executorCustodyBalancesMeta={orderConsole.executorCustodyBalancesMeta}
        isLoadingMoreExecutorCustody={orderConsole.isLoadingMoreExecutorCustody}
        onLoadMoreExecutorCustody={orderConsole.loadMoreExecutorCustody}
        template={orderConsole.executionOrderTemplate}
        itemOptions={orderConsole.executionOrderItemOptions}
        custodyOptions={orderConsole.executionOrderCustodyOptions}
        missingRequirements={orderConsole.executionOrderMissingRequirements}
        isLoading={orderConsole.isLoadingExecutionOrder}
        isSubmitting={orderConsole.isSubmittingExecutionOrder}
        error={orderConsole.executionOrderError}
        successMessage={orderConsole.executionOrderSuccess}
        offline={orderConsole.offline}
        onRefreshDetail={orderConsole.retryExecutionOrder}
        onClose={() => {
          const openedFromRow = openedFromRowRef.current;
          openedFromRowRef.current = false;
          closeExecutionOrder();
          // Cierre no destructivo (spec §4.6; CA-06): retira solo
          // `executionOrderId` preservando filtros, página y orden; sustituye al
          // `router.replace('/dashboard/operations')` del monolito (:1303).
          router.replace(
            withSearchParams(
              EXECUTION_ORDERS_PATH,
              mergeUrlSearchParams(searchParams, { executionOrderId: null }),
            ),
          );
          if (!openedFromRow) {
            // Deep link sin disparador de fila: el foco aterriza en el
            // encabezado de la región de resultados (UX spec §8.2.2/§11.3).
            window.requestAnimationFrame(() => {
              resultsHeaderRef.current?.focus();
            });
          }
        }}
        onStart={orderConsole.handleStartExecutionOrder}
        onRegisterActivity={orderConsole.handleRegisterExecutionOrderFieldWork}
        onUpdateActivity={orderConsole.handleUpdateExecutionOrderFieldWork}
        onDeleteActivity={orderConsole.handleDeleteExecutionOrderFieldWork}
        onRegisterItemUsage={orderConsole.handleRegisterExecutionOrderItemUsage}
        onUploadEvidence={orderConsole.handleUploadEvidence}
        onCloseOrder={orderConsole.handleCloseExecutionOrder}
      />
    </div>
  );
}
