'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Button, Badge, Tabs, TabsContent, TabsList, TabsTrigger } from '@iwana/ui';
import type { ListMeta } from '@iwana/shared';
import {
  ApiError,
  inventoryApi,
  type InventoryItemRecord,
  type SerializedAssetRecord,
  type StockLocationRecord,
} from '@/lib/api-client';
import { EMPTY_LIST_META, listPageWindow, normalizeListMeta } from '@/lib/list-meta';
import { PORTAL_DEFAULT_PAGE_SIZE } from '@/lib/portal-page-size';
import { useTableQueryState } from '@/lib/use-table-query-state';
import { portalModuleTabTriggerClassName } from '@/components/shared/portal-ui';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPageSizeSelect,
  PortalPanel,
  PortalResultsStrip,
  PortalSkeletonBlock,
  PortalTablePager,
  PortalTablePagination,
  portalDataTableShellClassName,
  portalDataBusyRegionClassName,
} from '@/components/shared/portal-ui';
import { formatInventoryDate, getSerializedAssetStatusLabel } from './inventory-labels';
import { AssetLoansPanel } from './AssetLoansPanel';
import { UsefulLifeAlertsPanel } from './UsefulLifeAlertsPanel';

export type AssetsSubview = 'list' | 'loans' | 'useful-life';

const ASSETS_RESOURCE = { singular: 'activo', plural: 'activos' } as const;
const ASSETS_NAMESPACE = 'assets';
const PAGE_OUT_OF_RANGE_NOTICE = 'Esa página ya no existe. Mostrando la última página disponible.';

interface AssetsWorkspaceProps {
  items?: InventoryItemRecord[];
  locations?: StockLocationRecord[];
  /** Enriquecimiento opcional de etiquetas en comodatos (no alimenta el listado). */
  enrichmentAssets?: SerializedAssetRecord[];
  /** Incrementar tras mutaciones externas para forzar recarga. */
  listRevision?: number;
  initialSubview?: AssetsSubview;
  onSubviewChange?: (subview: AssetsSubview) => void;
  onOpenAssetDetail: (assetId: string) => void;
  onNavigateToReplenishment?: () => void;
}

function mapAssetsListError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión de nuevo para continuar.';
    if (error.status === 403) return 'No tienes permisos para consultar activos.';
    if (error.status === 404) return 'El recurso solicitado ya no está disponible.';
    return error.message;
  }
  return 'No fue posible cargar los activos.';
}

function AssetsListSection({
  items,
  locations,
  listRevision,
  onOpenAssetDetail,
}: {
  items: InventoryItemRecord[];
  locations: StockLocationRecord[];
  listRevision: number;
  onOpenAssetDetail: (assetId: string) => void;
}) {
  const outOfRangeShownRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);
  const tableShellRef = useRef<HTMLDivElement | null>(null);

  const { page, pageSize, setPage, setPageSize, setQuery } = useTableQueryState({
    namespace: ASSETS_NAMESPACE,
    defaultPageSize: PORTAL_DEFAULT_PAGE_SIZE,
  });

  const [assets, setAssets] = useState<SerializedAssetRecord[]>([]);
  const [meta, setMeta] = useState<ListMeta>(EMPTY_LIST_META);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [outOfRangeNotice, setOutOfRangeNotice] = useState<string | null>(null);

  const itemMap = new Map(items.map((item) => [item.id, item]));
  const locationMap = new Map(locations.map((location) => [location.id, location]));

  const loadPage = useCallback(
    async (opts?: { soft?: boolean }) => {
      const soft = opts?.soft === true && hasLoadedOnceRef.current;
      if (soft) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setListError(null);

      try {
        const response = await inventoryApi.listAssets({
          page,
          limit: pageSize,
        });
        const nextMeta = normalizeListMeta(response.meta, {
          dataLength: response.data.length,
          limit: pageSize,
        });
        const requestedPage = page;
        const totalPages = nextMeta.totalPages ?? 0;

        if (totalPages > 0 && requestedPage > totalPages) {
          if (!outOfRangeShownRef.current) {
            outOfRangeShownRef.current = true;
            setOutOfRangeNotice(PAGE_OUT_OF_RANGE_NOTICE);
          }
          setQuery({ page: totalPages }, { history: 'replace' });
          return;
        }

        if (response.data.length === 0 && requestedPage > 1 && nextMeta.total > 0) {
          setQuery({ page: Math.max(1, totalPages || requestedPage - 1) }, { history: 'replace' });
          return;
        }

        setAssets(response.data);
        setMeta(nextMeta);
        hasLoadedOnceRef.current = true;
      } catch (loadError: unknown) {
        setListError(mapAssetsListError(loadError));
        if (!soft) {
          setAssets([]);
          setMeta(EMPTY_LIST_META);
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [page, pageSize, setQuery],
  );

  useEffect(() => {
    void loadPage({ soft: true });
  }, [loadPage, listRevision]);

  const prevPageRef = useRef(page);
  useEffect(() => {
    if (prevPageRef.current === page) return;
    prevPageRef.current = page;
    const el = tableShellRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      try {
        el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } catch {
        // jsdom
      }
    }
  }, [page]);

  const pageCount = meta.totalPages ?? (meta.total > 0 ? 1 : 0);
  const effectivePage = meta.page ?? page;
  const { from, to } = listPageWindow({
    page: effectivePage,
    limit: meta.limit || pageSize,
    total: meta.total,
  });
  const randomAccess = meta.capabilities.randomAccess;
  const showPager = !isLoading && meta.total > 0;
  const showPageSize = showPager && randomAccess && meta.total > Math.min(10, 20, 50);
  const resultsLabel =
    meta.total === 0
      ? '0 activos'
      : `${from}–${to} de ${meta.total} activo${meta.total === 1 ? '' : 's'}`;

  return (
    <div className="space-y-4">
      {listError ? (
        <PortalAlert
          variant="error"
          title="No fue posible cargar activos"
          description={listError}
        />
      ) : null}

      {outOfRangeNotice ? (
        <PortalAlert
          variant="warning"
          title="Página fuera de rango"
          description={outOfRangeNotice}
          live="polite"
        />
      ) : null}

      {isLoading ? (
        <PortalSkeletonBlock className="h-72" />
      ) : assets.length === 0 ? (
        <PortalEmptyState
          title="Sin activos con serial"
          description="Recibe una compra o registra equipos con serial para verlos aquí."
        />
      ) : (
        <>
          <div ref={tableShellRef} className={portalDataTableShellClassName}>
            <div
              className={
                isRefreshing
                  ? `overflow-x-auto ${portalDataBusyRegionClassName}`
                  : 'overflow-x-auto'
              }
              aria-busy={isRefreshing || undefined}
            >
              <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-border">
                <thead className="bg-gray-50 dark:bg-dark-surface-2">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                      Serial
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                      Producto
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                      Estado
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                      Ubicación
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                      Compra
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                      Acción
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                  {assets.map((asset) => (
                    <tr key={asset.id} data-testid={`asset-row-${asset.id}`}>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">
                        {asset.serialNumber ?? asset.assetTag ?? 'Sin serial'}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {itemMap.get(asset.inventoryItemId)?.name ?? 'Producto no encontrado'}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {getSerializedAssetStatusLabel(asset.currentStatus)}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {locationMap.get(asset.currentLocationId ?? '')?.name ?? 'Sin ubicación'}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {formatInventoryDate(asset.purchaseDate)}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => onOpenAssetDetail(asset.id)}
                        >
                          Ver detalle
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {showPager && randomAccess ? (
              <PortalTablePager
                page={effectivePage}
                pageCount={Math.max(1, pageCount)}
                onPageChange={setPage}
                from={from}
                to={to}
                total={meta.total}
                resource={ASSETS_RESOURCE}
                loading={isRefreshing}
                pageSizeControl={
                  showPageSize ? (
                    <PortalPageSizeSelect
                      value={pageSize}
                      onChange={setPageSize}
                      disabled={isRefreshing}
                    />
                  ) : undefined
                }
              />
            ) : null}
            {showPager && !randomAccess ? (
              <PortalTablePagination
                hasMore={meta.hasMore}
                onLoadMore={() => setPage(page + 1)}
                loading={isRefreshing}
                resourceLabel="activos"
                shown={to}
                total={meta.total}
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

export function AssetsWorkspace({
  items = [],
  locations = [],
  enrichmentAssets = [],
  listRevision = 0,
  initialSubview = 'list',
  onSubviewChange,
  onOpenAssetDetail,
  onNavigateToReplenishment,
}: AssetsWorkspaceProps) {
  return (
    <PortalPanel
      eyebrow="Activos"
      title="Activos con serial"
      description="Equipos identificados por serial para soporte, mantenimiento y comodato."
    >
      <Tabs
        value={initialSubview}
        onValueChange={(value) => onSubviewChange?.(value as AssetsSubview)}
      >
        <TabsList>
          <TabsTrigger value="list" className={portalModuleTabTriggerClassName}>
            Lista de activos
          </TabsTrigger>
          <TabsTrigger value="loans" className={portalModuleTabTriggerClassName}>
            Comodatos
          </TabsTrigger>
          <TabsTrigger value="useful-life" className={portalModuleTabTriggerClassName}>
            Vida útil
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <Suspense fallback={<PortalSkeletonBlock className="h-72" />}>
            <AssetsListSection
              items={items}
              locations={locations}
              listRevision={listRevision}
              onOpenAssetDetail={onOpenAssetDetail}
            />
          </Suspense>
        </TabsContent>

        <TabsContent value="loans" className="space-y-4">
          <AssetLoansPanel
            onOpenAssetDetail={onOpenAssetDetail}
            assets={enrichmentAssets}
            items={items}
          />
        </TabsContent>

        <TabsContent value="useful-life" className="space-y-4">
          <UsefulLifeAlertsPanel
            onOpenAssetDetail={onOpenAssetDetail}
            {...(onNavigateToReplenishment ? { onNavigateToReplenishment } : {})}
          />
        </TabsContent>
      </Tabs>
    </PortalPanel>
  );
}
