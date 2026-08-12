'use client';

import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { StockMovementOrigin } from '@iwana/shared';
import type { ListMeta } from '@iwana/shared';
import { Badge, Button, Input, Select } from '@iwana/ui';
import { inventoryApi, type StockMovementKardexRecord } from '@/lib/api-client';
import { EMPTY_LIST_META, listPageWindow, normalizeListMeta } from '@/lib/list-meta';
import { PORTAL_DEFAULT_PAGE_SIZE } from '@/lib/portal-page-size';
import { useTableQueryState } from '@/lib/use-table-query-state';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPageSizeSelect,
  PortalSearchField,
  PortalSkeletonBlock,
  PortalTablePager,
  PortalTablePagination,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
  portalDataBusyRegionClassName,
} from '@/components/shared/portal-ui';
import {
  formatInventoryDate,
  formatInventoryCostOrNone,
  formatInventoryQuantity,
  getStockAdjustmentReasonLabel,
  getStockMovementOriginLabel,
  INVENTORY_UNIT_COST_LABEL,
  STOCK_MOVEMENT_ORIGIN_LABELS,
} from './inventory-labels';
import {
  EMPTY_STOCK_KARDEX_FILTERS,
  buildListMovementsParams,
  hasActiveStockKardexFilters,
  type StockKardexFilters,
} from './stock-kardex-filters';
import { InventoryItemPicker } from './InventoryItemPicker';
import { InventoryLocationPicker } from './InventoryLocationPicker';

interface StockKardexPanelProps {
  initialFilters?: Partial<StockKardexFilters>;
}

const MOVEMENTS_RESOURCE = { singular: 'movimiento', plural: 'movimientos' } as const;
const FILTER_KEYS = ['search', 'origin', 'locationId', 'itemId', 'dateFrom', 'dateTo'] as const;
const PAGE_OUT_OF_RANGE_NOTICE = 'Esa página ya no existe. Mostrando la última página disponible.';

function filtersFromUrl(
  urlFilters: Record<string, string>,
  initial?: Partial<StockKardexFilters>,
): StockKardexFilters {
  return {
    search: urlFilters.search ?? initial?.search ?? '',
    origin:
      (urlFilters.origin as StockKardexFilters['origin'] | undefined) ?? initial?.origin ?? 'all',
    locationId: urlFilters.locationId ?? initial?.locationId ?? '',
    itemId: urlFilters.itemId ?? initial?.itemId ?? '',
    serializedAssetId: initial?.serializedAssetId ?? '',
    dateFrom: urlFilters.dateFrom ?? initial?.dateFrom ?? '',
    dateTo: urlFilters.dateTo ?? initial?.dateTo ?? '',
  };
}

function StockKardexPanelInner({ initialFilters }: StockKardexPanelProps) {
  const outOfRangeShownRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);
  const seededInitialRef = useRef(false);
  const tableShellRef = useRef<HTMLDivElement | null>(null);

  const {
    page,
    pageSize,
    filters: urlFilters,
    setPage,
    setPageSize,
    setFilters,
    setQuery,
  } = useTableQueryState({
    namespace: 'kardex',
    filterKeys: FILTER_KEYS,
    defaultPageSize: PORTAL_DEFAULT_PAGE_SIZE,
  });

  const filters = useMemo(
    () => filtersFromUrl(urlFilters, seededInitialRef.current ? undefined : initialFilters),
    [initialFilters, urlFilters],
  );

  useEffect(() => {
    if (seededInitialRef.current || !initialFilters) return;
    seededInitialRef.current = true;
    const seeded = filtersFromUrl({}, initialFilters);
    if (!hasActiveStockKardexFilters(seeded)) return;
    setFilters({
      search: seeded.search || null,
      origin: seeded.origin !== 'all' ? seeded.origin : null,
      locationId: seeded.locationId || null,
      itemId: seeded.itemId || null,
      dateFrom: seeded.dateFrom || null,
      dateTo: seeded.dateTo || null,
    });
  }, [initialFilters, setFilters]);

  const [totalMeta, setTotalMeta] = useState<ListMeta>(EMPTY_LIST_META);
  const [movements, setMovements] = useState<StockMovementKardexRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outOfRangeNotice, setOutOfRangeNotice] = useState<string | null>(null);
  const [locationFilterLabel, setLocationFilterLabel] = useState<string | null>(null);
  const [itemFilterLabel, setItemFilterLabel] = useState<string | null>(null);

  const urlSearch = filters.search ?? '';
  const [searchDraft, setSearchDraft] = useState(urlSearch);

  useEffect(() => {
    setSearchDraft(urlSearch);
  }, [urlSearch]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const trimmed = searchDraft.trim();
      if (trimmed === urlSearch.trim()) return;
      applyFilters({ ...filters, search: trimmed });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [searchDraft]); // eslint-disable-line react-hooks/exhaustive-deps -- solo debounce searchDraft

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
        const result = await inventoryApi.listMovements(
          buildListMovementsParams(filters, { page, limit: pageSize }),
        );
        const nextMeta = normalizeListMeta(
          {
            page: result.page,
            limit: result.limit ?? pageSize,
            total: result.total,
            mode: 'page',
            capabilities: { randomAccess: true, sortableFields: [] },
          },
          { dataLength: result.data.length, limit: pageSize },
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

        if (result.data.length === 0 && requestedPage > 1 && nextMeta.total > 0) {
          setQuery({ page: Math.max(1, totalPages || requestedPage - 1) }, { history: 'replace' });
          return;
        }

        setMovements(result.data);
        setTotalMeta(nextMeta);
        hasLoadedOnceRef.current = true;
      } catch {
        setError('No fue posible cargar el kardex.');
        if (!soft) {
          setMovements([]);
          setTotalMeta(EMPTY_LIST_META);
        }
      } finally {
        setIsLoading(false);
        setRefreshing(false);
      }
    },
    [filters, page, pageSize, setQuery],
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

  function applyFilters(next: StockKardexFilters) {
    setFilters({
      search: next.search || null,
      origin: next.origin !== 'all' ? next.origin : null,
      locationId: next.locationId || null,
      itemId: next.itemId || null,
      dateFrom: next.dateFrom || null,
      dateTo: next.dateTo || null,
    });
  }

  const pageCount = totalMeta.totalPages ?? (totalMeta.total > 0 ? 1 : 0);
  const effectivePage = totalMeta.page ?? page;
  const { from, to } = listPageWindow({
    page: effectivePage,
    limit: totalMeta.limit || pageSize,
    total: totalMeta.total,
  });
  const randomAccess = totalMeta.capabilities.randomAccess;
  const showPager = !isLoading && totalMeta.total > 0;
  const showPageSize = showPager && randomAccess && totalMeta.total > Math.min(10, 20, 50);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-3">
        <PortalSearchField
          id="stock-kardex-search"
          value={searchDraft}
          onChange={(search) => {
            setSearchDraft(search);
          }}
          placeholder="Número de movimiento"
          label="Buscar por número de movimiento"
        />
        <Select
          label="Origen"
          value={filters.origin}
          onChange={(event) => {
            applyFilters({
              ...filters,
              origin: event.target.value as StockKardexFilters['origin'],
            });
          }}
          options={[
            { value: 'all', label: 'Todos los orígenes' },
            ...Object.values(StockMovementOrigin).map((origin) => ({
              value: origin,
              label: STOCK_MOVEMENT_ORIGIN_LABELS[origin],
            })),
          ]}
        />
        <InventoryLocationPicker
          id="stock-kardex-location"
          label="Bodega"
          value={filters.locationId || null}
          selectedLabel={locationFilterLabel}
          placeholder="Todas las bodegas — busca para filtrar"
          onChange={(locationId, item) => {
            setLocationFilterLabel(item ? item.label : null);
            applyFilters({ ...filters, locationId: locationId ?? '' });
          }}
        />
        <InventoryItemPicker
          id="stock-kardex-item"
          label="Producto"
          value={filters.itemId || null}
          selectedLabel={itemFilterLabel}
          placeholder="Todos los productos — busca para filtrar"
          onChange={(itemId, item) => {
            setItemFilterLabel(item ? item.label : null);
            applyFilters({ ...filters, itemId: itemId ?? '' });
          }}
        />
        <Input
          label="Desde"
          type="date"
          value={filters.dateFrom}
          onChange={(event) => {
            applyFilters({ ...filters, dateFrom: event.target.value });
          }}
        />
        <Input
          label="Hasta"
          type="date"
          value={filters.dateTo}
          onChange={(event) => {
            applyFilters({ ...filters, dateTo: event.target.value });
          }}
        />
      </div>

      {hasActiveStockKardexFilters(filters) ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => applyFilters(EMPTY_STOCK_KARDEX_FILTERS)}
        >
          Limpiar filtros
        </Button>
      ) : null}

      {error ? (
        <PortalAlert variant="error" title="Error al cargar el kardex" description={error} />
      ) : null}
      {outOfRangeNotice ? (
        <PortalAlert
          variant="warning"
          title="Página fuera de rango"
          description={outOfRangeNotice}
          live="polite"
        />
      ) : null}
      {isLoading ? <PortalSkeletonBlock className="h-40" /> : null}

      {!isLoading && movements.length === 0 ? (
        <PortalEmptyState
          title="Sin movimientos"
          description="No hay movimientos que coincidan con los filtros."
        />
      ) : null}

      {!isLoading && movements.length > 0 ? (
        <div ref={tableShellRef} className={portalDataTableShellClassName}>
          <div
            className={
              refreshing ? `overflow-x-auto ${portalDataBusyRegionClassName}` : 'overflow-x-auto'
            }
            aria-busy={refreshing || undefined}
          >
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className={portalDataTableHeadClassName} />
                  <th className={portalDataTableHeadClassName}>Número</th>
                  <th className={portalDataTableHeadClassName}>Origen</th>
                  <th className={portalDataTableHeadClassName}>Razón</th>
                  <th className={portalDataTableHeadClassName}>Fecha</th>
                  <th className={portalDataTableHeadClassName}>Líneas</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => {
                  const expanded = expandedId === movement.id;
                  return (
                    <Fragment key={movement.id}>
                      <tr className={portalTableRowHoverClassName}>
                        <td className={portalDataTableCellClassName}>
                          <button
                            type="button"
                            className="inline-flex items-center text-iwana-secondary-700 dark:text-iwana-secondary-400"
                            aria-expanded={expanded}
                            aria-label={expanded ? 'Contraer líneas' : 'Expandir líneas'}
                            onClick={() =>
                              setExpandedId((current) =>
                                current === movement.id ? null : movement.id,
                              )
                            }
                          >
                            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        </td>
                        <td className={portalDataTableCellClassName}>{movement.movementNumber}</td>
                        <td className={portalDataTableCellClassName}>
                          {getStockMovementOriginLabel(movement.origin)}
                        </td>
                        <td className={portalDataTableCellClassName}>
                          {movement.adjustmentReason
                            ? getStockAdjustmentReasonLabel(movement.adjustmentReason)
                            : '—'}
                        </td>
                        <td className={portalDataTableCellClassName}>
                          {formatInventoryDate(movement.createdAt)}
                        </td>
                        <td className={portalDataTableCellClassName}>{movement.lines.length}</td>
                      </tr>
                      {expanded ? (
                        <tr>
                          <td colSpan={6} className={portalDataTableCellClassName}>
                            <ul className="space-y-1 text-sm text-iwana-secondary-700 dark:text-iwana-secondary-400">
                              {movement.lines.map((line) => (
                                <li key={line.id}>
                                  {line.itemSku ?? line.itemId} ·{' '}
                                  {line.locationName ?? line.locationId}
                                  {line.lotNumber ? ` · Lote ${line.lotNumber}` : ''} ·{' '}
                                  <span className="tabular-nums">
                                    {formatInventoryQuantity(line.quantity)}
                                    {line.unitCost != null && line.unitCost !== ''
                                      ? ` · ${INVENTORY_UNIT_COST_LABEL} ${formatInventoryCostOrNone(line.unitCost)}`
                                      : ''}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
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
              total={totalMeta.total}
              resource={MOVEMENTS_RESOURCE}
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
              hasMore={totalMeta.hasMore}
              onLoadMore={() => setPage(page + 1)}
              loading={refreshing}
              resourceLabel="movimientos"
              shown={to}
              total={totalMeta.total}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function StockKardexPanel(props: StockKardexPanelProps) {
  return (
    <Suspense fallback={<PortalSkeletonBlock className="h-40" />}>
      <StockKardexPanelInner {...props} />
    </Suspense>
  );
}
