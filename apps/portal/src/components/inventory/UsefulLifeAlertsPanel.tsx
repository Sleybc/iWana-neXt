'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Select } from '@iwana/ui';
import type { ListMeta } from '@iwana/shared';
import {
  ApiError,
  inventoryApi,
  type UsefulLifeAlertRecord,
  type UsefulLifeAlertStatus,
} from '@/lib/api-client';
import { EMPTY_LIST_META, listPageWindow, normalizeListMeta } from '@/lib/list-meta';
import { PORTAL_DEFAULT_PAGE_SIZE } from '@/lib/portal-page-size';
import { useTableQueryState } from '@/lib/use-table-query-state';
import {
  PortalDataTableHead,
  PortalAlert,
  PortalEmptyState,
  PortalPageSizeSelect,
  PortalSkeletonBlock,
  PortalTablePager,
  PortalTablePagination,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
  portalDataTableShellClassName,
  portalDataBusyRegionClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import {
  formatInventoryDate,
  getUsefulLifeStatusBadgeVariant,
  getUsefulLifeStatusLabel,
  USEFUL_LIFE_STATUS_LABELS,
} from './inventory-labels';

export type UsefulLifeAlertStatusFilter = UsefulLifeAlertStatus | 'all';

interface UsefulLifeAlertsPanelProps {
  onOpenAssetDetail: (assetId: string) => void;
  onNavigateToReplenishment?: () => void;
}

const STATUS_FILTER_OPTIONS: Array<{ value: UsefulLifeAlertStatusFilter; label: string }> = [
  { value: 'all', label: 'Por vencer y vencida' },
  { value: 'por-vencer', label: USEFUL_LIFE_STATUS_LABELS['por-vencer'] },
  { value: 'vencida', label: USEFUL_LIFE_STATUS_LABELS.vencida },
];

const ALERTS_RESOURCE = { singular: 'alerta', plural: 'alertas' } as const;
const FILTER_KEYS = ['status'] as const;
const PAGE_OUT_OF_RANGE_NOTICE = 'Esa página ya no existe. Mostrando la última página disponible.';

function mapInventoryError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión de nuevo para continuar.';
    if (error.status === 403) return 'No tienes permisos para consultar alertas de vida útil.';
    if (error.status === 404) return 'El recurso solicitado ya no está disponible.';
    return error.message;
  }

  return 'No fue posible cargar las alertas de vida útil.';
}

function resolveAssetLabel(alert: UsefulLifeAlertRecord): string {
  const sku = alert.sku?.trim() || 'Sin SKU';
  const serial = alert.serialNumber?.trim() || alert.assetTag?.trim() || 'Sin serial';
  return `${sku} · ${serial}`;
}

function formatMonthsRemaining(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  if (value <= 0) {
    return '0';
  }
  return String(value);
}

function UsefulLifeAlertsPanelInner({
  onOpenAssetDetail,
  onNavigateToReplenishment,
}: UsefulLifeAlertsPanelProps) {
  const outOfRangeShownRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);
  const tableShellRef = useRef<HTMLDivElement | null>(null);

  const { page, pageSize, filters, setPage, setPageSize, setFilters, setQuery } =
    useTableQueryState({
      namespace: 'usefulLife',
      filterKeys: FILTER_KEYS,
      defaultPageSize: PORTAL_DEFAULT_PAGE_SIZE,
    });

  const statusFilter = (filters.status as UsefulLifeAlertStatusFilter | undefined) ?? 'all';
  const [alerts, setAlerts] = useState<UsefulLifeAlertRecord[]>([]);
  const [meta, setMeta] = useState<ListMeta>(EMPTY_LIST_META);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outOfRangeNotice, setOutOfRangeNotice] = useState<string | null>(null);

  const loadPage = useCallback(
    async (opts?: { soft?: boolean }) => {
      const soft = opts?.soft === true && hasLoadedOnceRef.current;
      if (soft) {
        setRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const response = await inventoryApi.listUsefulLifeAlerts({
          ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
          page,
          pageSize,
        });
        const nextMeta = normalizeListMeta(
          {
            page: response.page,
            limit: response.limit ?? response.pageSize ?? pageSize,
            total: response.total,
            mode: 'page',
            capabilities: { randomAccess: true, sortableFields: [] },
          },
          { dataLength: response.data.length, limit: pageSize },
        );
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

        setAlerts(response.data);
        setMeta(nextMeta);
        hasLoadedOnceRef.current = true;
      } catch (loadError: unknown) {
        setError(mapInventoryError(loadError));
        if (!soft) {
          setAlerts([]);
          setMeta(EMPTY_LIST_META);
        }
      } finally {
        setIsLoading(false);
        setRefreshing(false);
      }
    },
    [page, pageSize, setQuery, statusFilter],
  );

  useEffect(() => {
    void loadPage({ soft: true });
  }, [loadPage]);

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

  return (
    <div className="space-y-4" data-testid="useful-life-alerts-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-xs">
          <Select
            label="Estado"
            value={statusFilter}
            onChange={(event) =>
              setFilters({
                status:
                  event.target.value === 'all'
                    ? null
                    : (event.target.value as UsefulLifeAlertStatusFilter),
              })
            }
            options={STATUS_FILTER_OPTIONS}
            data-testid="useful-life-alerts-status-filter"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {onNavigateToReplenishment ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onNavigateToReplenishment}
              data-testid="useful-life-alerts-replenishment-cta"
            >
              Ver reposición
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="secondary" onClick={() => void loadPage()}>
            Actualizar
          </Button>
        </div>
      </div>

      {onNavigateToReplenishment ? (
        <p className="text-sm text-iwana-secondary-700 dark:text-gray-300">
          Para productos con stock bajo usa la bandeja de reposición en Existencias; no se duplica
          aquí.
        </p>
      ) : null}

      {error ? (
        <PortalAlert
          variant="error"
          title="No fue posible cargar alertas de vida útil"
          description={error}
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
      ) : alerts.length === 0 ? (
        <PortalEmptyState
          title="Sin alertas de vida útil"
          description="No hay activos por vencer ni con vida útil vencida con los filtros actuales."
        />
      ) : (
        <div ref={tableShellRef} className={portalDataTableShellClassName}>
          <div
            className={
              refreshing ? `overflow-x-auto ${portalDataBusyRegionClassName}` : 'overflow-x-auto'
            }
            aria-busy={refreshing || undefined}
          >
            <table className="min-w-full text-sm">
              <thead className={portalDataTableHeadRowClassName}>
                <tr>
                  <PortalDataTableHead>Activo</PortalDataTableHead>
                  <PortalDataTableHead>Producto</PortalDataTableHead>
                  <PortalDataTableHead>Estado</PortalDataTableHead>
                  <PortalDataTableHead>Meses restantes</PortalDataTableHead>
                  <PortalDataTableHead>Compra</PortalDataTableHead>
                  <PortalDataTableHead>Garantía</PortalDataTableHead>
                  <PortalDataTableHead>Acción</PortalDataTableHead>
                </tr>
              </thead>
              <tbody className={portalDataTableBodyClassName}>
                {alerts.map((alert) => (
                  <tr
                    key={alert.id}
                    className={portalTableRowHoverClassName}
                    data-testid={`useful-life-alert-row-${alert.id}`}
                  >
                    <td className={`${portalDataTableCellClassName} font-mono text-xs`}>
                      {resolveAssetLabel(alert)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {alert.itemName?.trim() || 'Producto no identificado'}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      <Badge variant={getUsefulLifeStatusBadgeVariant(alert.status)}>
                        {getUsefulLifeStatusLabel(alert.status)}
                      </Badge>
                    </td>
                    <td className={`${portalDataTableCellClassName} tabular-nums`}>
                      {formatMonthsRemaining(alert.monthsRemaining)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {formatInventoryDate(alert.purchaseDate)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {formatInventoryDate(alert.warrantyUntil)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => onOpenAssetDetail(alert.id)}
                      >
                        Ver ficha 360
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
              resource={ALERTS_RESOURCE}
              loading={refreshing}
              pageSizeControl={
                showPageSize ? (
                  <PortalPageSizeSelect
                    value={pageSize}
                    onChange={setPageSize}
                    disabled={refreshing}
                  />
                ) : undefined
              }
            />
          ) : null}
          {showPager && !randomAccess ? (
            <PortalTablePagination
              hasMore={meta.hasMore}
              onLoadMore={() => setPage(page + 1)}
              loading={refreshing}
              resourceLabel="alertas"
              shown={to}
              total={meta.total}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

export function UsefulLifeAlertsPanel(props: UsefulLifeAlertsPanelProps) {
  return (
    <Suspense fallback={<PortalSkeletonBlock className="h-72" />}>
      <UsefulLifeAlertsPanelInner {...props} />
    </Suspense>
  );
}
