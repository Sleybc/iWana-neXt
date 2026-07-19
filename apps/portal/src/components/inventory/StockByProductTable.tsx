'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, Select } from '@iwana/ui';
import type {
  InventoryItemRecord,
  StockBalanceRecord,
  StockLocationRecord,
} from '@/lib/api-client';
import {
  PortalEmptyState,
  PortalSearchField,
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
import {
  buildStockOverviewRows,
  filterStockOverviewRows,
  isStockAdjustableItem,
  type StockOverviewStatus,
} from './stock-overview';

interface StockByProductTableProps {
  items: InventoryItemRecord[];
  balances: StockBalanceRecord[];
  locations: StockLocationRecord[];
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

export function StockByProductTable({
  items,
  balances,
  locations,
  canAdjust = false,
  onViewDetail,
  onAdjust,
}: StockByProductTableProps) {
  const [search, setSearch] = useState('');
  const [onlyBelowMinimum, setOnlyBelowMinimum] = useState(false);
  const [locationId, setLocationId] = useState('');

  const rows = useMemo(
    () =>
      filterStockOverviewRows(
        buildStockOverviewRows(items, balances, { locationId: locationId || null }),
        { search, onlyBelowMinimum },
      ),
    [balances, items, locationId, onlyBelowMinimum, search],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex-1">
          <PortalSearchField
            id="stock-by-product-search"
            value={search}
            onChange={setSearch}
            placeholder="Buscar por SKU o nombre"
            label="Buscar existencias por producto"
          />
        </div>
        <div className="w-full lg:w-56">
          <Select
            label="Bodega"
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
            options={[
              { value: '', label: 'Todas las bodegas' },
              ...locations.map((location) => ({
                value: location.id,
                label: `${location.code} · ${location.name}`,
              })),
            ]}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-iwana-secondary-700">
          <input
            type="checkbox"
            checked={onlyBelowMinimum}
            onChange={(event) => setOnlyBelowMinimum(event.target.checked)}
          />
          Solo bajo mínimo
        </label>
      </div>

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
        </div>
      )}

      <p className="text-xs text-iwana-secondary-700 dark:text-gray-400">
        {STOCK_RESERVED_HELP_TEXT}
      </p>
    </div>
  );
}
