'use client';

import { Fragment, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { StockMovementOrigin } from '@iwana/shared';
import { Button, Input, Select } from '@iwana/ui';
import {
  inventoryApi,
  type InventoryItemRecord,
  type StockLocationRecord,
  type StockMovementKardexRecord,
} from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalSearchField,
  PortalSkeletonBlock,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import {
  formatInventoryDate,
  formatInventoryQuantity,
  getStockAdjustmentReasonLabel,
  getStockMovementOriginLabel,
  STOCK_MOVEMENT_ORIGIN_LABELS,
} from './inventory-labels';
import {
  EMPTY_STOCK_KARDEX_FILTERS,
  buildListMovementsParams,
  hasActiveStockKardexFilters,
  type StockKardexFilters,
} from './stock-kardex-filters';

interface StockKardexPanelProps {
  items: InventoryItemRecord[];
  locations: StockLocationRecord[];
}

export function StockKardexPanel({ items, locations }: StockKardexPanelProps) {
  const [filters, setFilters] = useState<StockKardexFilters>(EMPTY_STOCK_KARDEX_FILTERS);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [movements, setMovements] = useState<StockMovementKardexRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void inventoryApi
      .listMovements(buildListMovementsParams(filters, { page, limit }))
      .then((result) => {
        if (cancelled) return;
        setMovements(result.data);
        setTotal(result.total);
      })
      .catch(() => {
        if (cancelled) return;
        setError('No fue posible cargar el kardex.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filters, limit, page]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-3">
        <PortalSearchField
          id="stock-kardex-search"
          value={filters.search}
          onChange={(search) => {
            setPage(1);
            setFilters((current) => ({ ...current, search }));
          }}
          placeholder="Número de movimiento"
          label="Buscar por número de movimiento"
        />
        <Select
          label="Origen"
          value={filters.origin}
          onChange={(event) => {
            setPage(1);
            setFilters((current) => ({
              ...current,
              origin: event.target.value as StockKardexFilters['origin'],
            }));
          }}
          options={[
            { value: 'all', label: 'Todos los orígenes' },
            ...Object.values(StockMovementOrigin).map((origin) => ({
              value: origin,
              label: STOCK_MOVEMENT_ORIGIN_LABELS[origin],
            })),
          ]}
        />
        <Select
          label="Bodega"
          value={filters.locationId}
          onChange={(event) => {
            setPage(1);
            setFilters((current) => ({ ...current, locationId: event.target.value }));
          }}
          options={[
            { value: '', label: 'Todas las bodegas' },
            ...locations.map((location) => ({
              value: location.id,
              label: `${location.code} · ${location.name}`,
            })),
          ]}
        />
        <Select
          label="Producto"
          value={filters.itemId}
          onChange={(event) => {
            setPage(1);
            setFilters((current) => ({ ...current, itemId: event.target.value }));
          }}
          options={[
            { value: '', label: 'Todos los productos' },
            ...items.map((item) => ({
              value: item.id,
              label: `${item.sku} · ${item.name}`,
            })),
          ]}
        />
        <Input
          label="Desde"
          type="date"
          value={filters.dateFrom}
          onChange={(event) => {
            setPage(1);
            setFilters((current) => ({ ...current, dateFrom: event.target.value }));
          }}
        />
        <Input
          label="Hasta"
          type="date"
          value={filters.dateTo}
          onChange={(event) => {
            setPage(1);
            setFilters((current) => ({ ...current, dateTo: event.target.value }));
          }}
        />
      </div>

      {hasActiveStockKardexFilters(filters) ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            setPage(1);
            setFilters(EMPTY_STOCK_KARDEX_FILTERS);
          }}
        >
          Limpiar filtros
        </Button>
      ) : null}

      {error ? (
        <PortalAlert variant="error" title="Error al cargar el kardex" description={error} />
      ) : null}
      {isLoading ? <PortalSkeletonBlock className="h-40" /> : null}

      {!isLoading && movements.length === 0 ? (
        <PortalEmptyState
          title="Sin movimientos"
          description="No hay movimientos que coincidan con los filtros."
        />
      ) : null}

      {!isLoading && movements.length > 0 ? (
        <div className={portalDataTableShellClassName}>
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
                          className="inline-flex items-center text-iwana-secondary-700"
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
                          <ul className="space-y-1 text-sm text-iwana-secondary-700">
                            {movement.lines.map((line) => (
                              <li key={line.id}>
                                {line.itemSku ?? line.itemId} ·{' '}
                                {line.locationName ?? line.locationId}
                                {line.lotNumber ? ` · Lote ${line.lotNumber}` : ''} ·{' '}
                                {formatInventoryQuantity(line.quantity)}
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
      ) : null}

      <div className="flex items-center justify-between">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={page <= 1 || isLoading}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          Anterior
        </Button>
        <span className="text-sm text-iwana-secondary-700">
          Página {page} de {totalPages} · {total} movimientos
        </span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={page >= totalPages || isLoading}
          onClick={() => setPage((current) => current + 1)}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
