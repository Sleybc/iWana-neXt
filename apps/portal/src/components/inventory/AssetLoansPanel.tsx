'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Button, Select } from '@iwana/ui';
import type { ListMeta } from '@iwana/shared';
import {
  ApiError,
  inventoryApi,
  type AssetLoanRecord,
  type AssetLoanStatus,
  type InventoryItemRecord,
  type SerializedAssetRecord,
} from '@/lib/api-client';
import { EMPTY_LIST_META, listPageWindow, normalizeListMeta } from '@/lib/list-meta';
import { PORTAL_DEFAULT_PAGE_SIZE } from '@/lib/portal-page-size';
import { useTableQueryState } from '@/lib/use-table-query-state';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPageSizeSelect,
  PortalSkeletonBlock,
  PortalTablePager,
  PortalTablePagination,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableShellClassName,
  portalDataBusyRegionClassName,
} from '@/components/shared/portal-ui';
import {
  ASSET_LOAN_STATUS_LABELS,
  formatInventoryOpaqueRef,
  formatInventoryDateTime,
  getAssetLoanStatusLabel,
} from './inventory-labels';

export type AssetLoanStatusFilter = AssetLoanStatus | 'all';

interface AssetLoansPanelProps {
  onOpenAssetDetail: (assetId: string) => void;
  /** Enriquecimiento opcional de etiquetas (SKU · serial) desde el workspace. */
  assets?: SerializedAssetRecord[];
  items?: InventoryItemRecord[];
  /** Incrementar tras mutaciones externas para forzar recarga. */
  revision?: number;
}

const STATUS_FILTER_OPTIONS: Array<{ value: AssetLoanStatusFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'abierto', label: ASSET_LOAN_STATUS_LABELS.abierto },
  { value: 'cerrado', label: ASSET_LOAN_STATUS_LABELS.cerrado },
];

const LOANS_RESOURCE = { singular: 'comodato', plural: 'comodatos' } as const;
const FILTER_KEYS = ['status'] as const;
const PAGE_OUT_OF_RANGE_NOTICE = 'Esa página ya no existe. Mostrando la última página disponible.';

function mapInventoryError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión de nuevo para continuar.';
    if (error.status === 403) return 'No tienes permisos para consultar comodatos.';
    if (error.status === 404) return 'El recurso solicitado ya no está disponible.';
    return error.message;
  }

  return 'No fue posible cargar los comodatos.';
}

function resolveAssetLabel(
  loan: AssetLoanRecord,
  assets: SerializedAssetRecord[],
  items: InventoryItemRecord[],
): string {
  const asset = assets.find((entry) => entry.id === loan.serializedAssetId);
  const item = items.find((entry) => entry.id === asset?.inventoryItemId);
  const sku = item?.sku ?? 'Sin SKU';
  const serial = asset?.serialNumber ?? asset?.assetTag ?? 'Sin serial';
  return `${sku} · ${serial}`;
}

function AssetLoansPanelInner({
  onOpenAssetDetail,
  assets = [],
  items = [],
  revision = 0,
}: AssetLoansPanelProps) {
  const outOfRangeShownRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);
  const tableShellRef = useRef<HTMLDivElement | null>(null);

  const { page, pageSize, filters, setPage, setPageSize, setFilters, setQuery } =
    useTableQueryState({
      namespace: 'assetLoans',
      filterKeys: FILTER_KEYS,
      defaultPageSize: PORTAL_DEFAULT_PAGE_SIZE,
    });

  const statusFilter = (filters.status as AssetLoanStatusFilter | undefined) ?? 'all';
  const [loans, setLoans] = useState<AssetLoanRecord[]>([]);
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
        const response = await inventoryApi.listLoans({
          ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
          page,
          limit: pageSize,
        });
        const nextMeta = normalizeListMeta(
          {
            page: response.page,
            limit: response.limit ?? pageSize,
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

        setLoans(response.data);
        setMeta(nextMeta);
        hasLoadedOnceRef.current = true;
      } catch (loadError: unknown) {
        setError(mapInventoryError(loadError));
        if (!soft) {
          setLoans([]);
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
  }, [loadPage, revision]);

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
    <div className="space-y-4" data-testid="asset-loans-panel">
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
                    : (event.target.value as AssetLoanStatusFilter),
              })
            }
            options={STATUS_FILTER_OPTIONS}
            data-testid="asset-loans-status-filter"
          />
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => void loadPage()}>
          Actualizar
        </Button>
      </div>

      {error ? (
        <PortalAlert variant="error" title="No fue posible cargar comodatos" description={error} />
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
      ) : loans.length === 0 ? (
        <PortalEmptyState
          title="Sin comodatos registrados"
          description="Los equipos instalados en clientes desde una orden de trabajo aparecerán aquí."
        />
      ) : (
        <div ref={tableShellRef} className={portalDataTableShellClassName}>
          <div
            className={
              refreshing ? `overflow-x-auto ${portalDataBusyRegionClassName}` : 'overflow-x-auto'
            }
            aria-busy={refreshing || undefined}
          >
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-border">
              <thead className="bg-gray-50 dark:bg-dark-surface-2">
                <tr>
                  <th className={portalDataTableHeadClassName}>Activo</th>
                  <th className={portalDataTableHeadClassName}>Suscriptor</th>
                  <th className={portalDataTableHeadClassName}>Contrato</th>
                  <th className={portalDataTableHeadClassName}>Instalado el</th>
                  <th className={portalDataTableHeadClassName}>Estado</th>
                  <th className={portalDataTableHeadClassName}>Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                {loans.map((loan) => (
                  <tr key={loan.id} data-testid={`asset-loan-row-${loan.id}`}>
                    <td className={portalDataTableCellClassName}>
                      {resolveAssetLabel(loan, assets, items)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {formatInventoryOpaqueRef('subscriber', loan.subscriberRefId)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {formatInventoryOpaqueRef('contract', loan.contractRefId)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {formatInventoryDateTime(loan.installedAt)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {getAssetLoanStatusLabel(loan.status)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => onOpenAssetDetail(loan.serializedAssetId)}
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
              resource={LOANS_RESOURCE}
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
              resourceLabel="comodatos"
              shown={to}
              total={meta.total}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

export function AssetLoansPanel(props: AssetLoansPanelProps) {
  return (
    <Suspense fallback={<PortalSkeletonBlock className="h-72" />}>
      <AssetLoansPanelInner {...props} />
    </Suspense>
  );
}
