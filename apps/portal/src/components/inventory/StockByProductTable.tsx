'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Select } from '@iwana/ui';
import type {
  InventoryItemRecord,
  StockBalanceRecord,
  StockLocationRecord,
} from '@/lib/api-client';
import {
  PortalEmptyState,
  PortalResultsStrip,
  PortalSearchField,
  PortalTablePagination,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import {
  STOCK_AVAILABLE_LABEL,
  STOCK_ON_HAND_LABEL,
  STOCK_RESERVED_HELP_TEXT,
  STOCK_RESERVED_LABEL,
  formatInventoryQuantity,
} from './inventory-labels';
import { formatInventoryResultsLabel } from './inventory-list-pagination';
import {
  buildStockOverviewRows,
  isStockAdjustableItem,
  type StockOverviewStatus,
} from './stock-overview';

export interface StockByProductServerFilters {
  search: string;
  onlyBelowMinimum: boolean;
  stockLocationId: string;
}

interface StockByProductTableProps {
  items: InventoryItemRecord[];
  balances: StockBalanceRecord[];
  locations: StockLocationRecord[];
  /** Total servidor de productos (meta.total). */
  totalCount?: number;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  /** Filtros controlados por el padre (servidor Ola 6). */
  filters?: StockByProductServerFilters;
  onFiltersChange?: (filters: StockByProductServerFilters) => void;
  canAdjust?: boolean;
  onViewDetail: (itemId: string) => void;
  onAdjust?: (itemId: string) => void;
}

function statusBadgeVariant(
  status: StockOverviewStatus,
): 'neutral' | 'warning' | 'error' | 'success' {
  if (status === 'out') return 'error';
  if (status === 'below-minimum') return 'warning';
  if (status === 'below-reorder') return 'warning';
  return 'success';
}

const EMPTY_FILTERS: StockByProductServerFilters = {
  search: '',
  onlyBelowMinimum: false,
  stockLocationId: '',
};

export function StockByProductTable({
  items,
  balances,
  locations,
  totalCount,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  filters: filtersProp,
  onFiltersChange,
  canAdjust = false,
  onViewDetail,
  onAdjust,
}: StockByProductTableProps) {
  const [filtersLocal, setFiltersLocal] = useState<StockByProductServerFilters>(EMPTY_FILTERS);
  const filters = onFiltersChange ? (filtersProp ?? EMPTY_FILTERS) : filtersLocal;
  const setFilters = (next: StockByProductServerFilters) => {
    if (onFiltersChange) {
      onFiltersChange(next);
    } else {
      setFiltersLocal(next);
    }
  };

  const { search, onlyBelowMinimum, stockLocationId } = filters;

  // Debounce local de búsqueda antes de notificar al padre (servidor).
  const [searchDraft, setSearchDraft] = useState(search);
  useEffect(() => {
    setSearchDraft(search);
  }, [search]);
  useEffect(() => {
    if (!onFiltersChange) {
      return;
    }
    const handle = window.setTimeout(() => {
      if (searchDraft === search) return;
      setFilters({ ...filters, search: searchDraft });
    }, 300);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debounce searchDraft
  }, [searchDraft, onFiltersChange]);

  const rows = useMemo(
    () =>
      buildStockOverviewRows(items, balances, {
        locationId: stockLocationId || null,
      }),
    [balances, items, stockLocationId],
  );

  const resolvedTotal = totalCount ?? items.length;
  const resultsLabel = formatInventoryResultsLabel({
    loaded: rows.length,
    total: resolvedTotal,
    hasMore,
    singular: 'producto',
    plural: 'productos',
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex-1">
          <PortalSearchField
            id="stock-by-product-search"
            value={onFiltersChange ? searchDraft : search}
            onChange={(value) => {
              if (onFiltersChange) {
                setSearchDraft(value);
              } else {
                setFilters({ ...filters, search: value });
              }
            }}
            placeholder="Buscar por SKU o nombre"
            label="Buscar existencias por producto"
          />
        </div>
        <div className="w-full lg:w-56">
          <Select
            label="Bodega"
            value={stockLocationId}
            onChange={(event) => setFilters({ ...filters, stockLocationId: event.target.value })}
            options={[
              { value: '', label: 'Todas las bodegas' },
              ...locations.map((location) => ({
                value: location.id,
                label: `${location.code} · ${location.name}`,
              })),
            ]}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-iwana-secondary-700 dark:text-iwana-secondary-400">
          <input
            type="checkbox"
            checked={onlyBelowMinimum}
            onChange={(event) => setFilters({ ...filters, onlyBelowMinimum: event.target.checked })}
          />
          Solo bajo mínimo
        </label>
      </div>

      <PortalResultsStrip badge={<Badge variant="neutral">{resultsLabel}</Badge>} />

      {rows.length === 0 ? (
        <PortalEmptyState
          title="Sin existencias para mostrar"
          description="Ajusta los filtros o registra saldos en bodega."
        />
      ) : (
        <div className={portalDataTableShellClassName}>
          <table className="min-w-full">
            <thead>
              <tr>
                <th scope="col" className={portalDataTableHeadClassName}>
                  SKU
                </th>
                <th scope="col" className={portalDataTableHeadClassName}>
                  Producto
                </th>
                <th scope="col" className={portalDataTableHeadClassName}>
                  {STOCK_ON_HAND_LABEL}
                </th>
                <th scope="col" className={portalDataTableHeadClassName}>
                  {STOCK_RESERVED_LABEL}
                </th>
                <th scope="col" className={portalDataTableHeadClassName}>
                  {STOCK_AVAILABLE_LABEL}
                </th>
                <th scope="col" className={portalDataTableHeadClassName}>
                  Mínimo
                </th>
                <th scope="col" className={portalDataTableHeadClassName}>
                  Reorden
                </th>
                <th scope="col" className={portalDataTableHeadClassName}>
                  Estado
                </th>
                <th scope="col" className={portalDataTableHeadClassName}>
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.item.id} className={portalTableRowHoverClassName}>
                  <td className={portalDataTableCellClassName}>{row.item.sku}</td>
                  <td className={portalDataTableCellClassName}>{row.item.name}</td>
                  <td className={`${portalDataTableCellClassName} tabular-nums`}>
                    {formatInventoryQuantity(row.onHand)}
                  </td>
                  <td className={`${portalDataTableCellClassName} tabular-nums`}>
                    {formatInventoryQuantity(row.reserved)}
                  </td>
                  <td className={`${portalDataTableCellClassName} tabular-nums`}>
                    {formatInventoryQuantity(row.available)}
                  </td>
                  <td className={`${portalDataTableCellClassName} tabular-nums`}>
                    {formatInventoryQuantity(row.minimumStock)}
                  </td>
                  <td className={`${portalDataTableCellClassName} tabular-nums`}>
                    {formatInventoryQuantity(row.reorderPoint)}
                  </td>
                  <td className={portalDataTableCellClassName}>
                    <Badge variant={statusBadgeVariant(row.status)}>{row.statusLabel}</Badge>
                  </td>
                  <td className={portalDataTableCellClassName}>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => onViewDetail(row.item.id)}
                      >
                        Ver detalle
                      </Button>
                      {canAdjust && onAdjust && isStockAdjustableItem(row.item) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => onAdjust(row.item.id)}
                        >
                          Ajustar
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {onLoadMore ? (
            <PortalTablePagination
              hasMore={hasMore}
              onLoadMore={onLoadMore}
              loading={isLoadingMore}
              resourceLabel="productos"
              shown={items.length}
              total={resolvedTotal}
            />
          ) : null}
        </div>
      )}

      <p className="text-xs text-iwana-secondary-700 dark:text-iwana-secondary-400">
        {STOCK_RESERVED_HELP_TEXT}
      </p>
    </div>
  );
}
