'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, ModalLayer } from '@iwana/ui';
import {
  inventoryApi,
  type InventoryItemRecord,
  type StockBalanceRecord,
  type StockLocationRecord,
  type StockMovementKardexRecord,
} from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalSkeletonBlock,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
} from '@/components/shared/portal-ui';
import { InventoryMetaItem } from './InventoryMetaItem';
import { usePortalSideDrawerA11y } from '@/components/shared/use-portal-side-drawer-a11y';
import { usePortalModalDrawerBroadcast } from '@/components/shared/use-portal-modal-drawer-broadcast';
import {
  STOCK_AVAILABLE_LABEL,
  STOCK_ON_HAND_LABEL,
  STOCK_RESERVED_HELP_TEXT,
  STOCK_RESERVED_LABEL,
  formatInventoryCostOrNone,
  formatInventoryDate,
  formatInventoryQuantity,
  getStockBalanceConditionLabel,
  getStockMovementOriginLabel,
  INVENTORY_AVERAGE_COST_HELP_TEXT,
  INVENTORY_AVERAGE_COST_LABEL,
  INVENTORY_LAST_PURCHASE_COST_LABEL,
  INVENTORY_UNIT_COST_LABEL,
} from './inventory-labels';
import { getAvailableQtyFromBalance } from './stock-issue-balance-utils';
import { isStockAdjustableItem } from './stock-overview';

interface StockItemDetailDrawerProps {
  open: boolean;
  item: InventoryItemRecord | null;
  balances: StockBalanceRecord[];
  locations: StockLocationRecord[];
  canAdjust?: boolean;
  onClose: () => void;
  onAdjust?: (itemId: string) => void;
}

export function StockItemDetailDrawer({
  open,
  item,
  balances,
  locations,
  canAdjust = false,
  onClose,
  onAdjust,
}: StockItemDetailDrawerProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const [movements, setMovements] = useState<StockMovementKardexRecord[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemIsAdjustable = item ? isStockAdjustableItem(item) : false;

  const locationById = useMemo(
    () => new Map(locations.map((location) => [location.id, location])),
    [locations],
  );

  const itemBalances = useMemo(
    () => (item ? balances.filter((balance) => balance.itemId === item.id) : []),
    [balances, item],
  );

  useEffect(() => {
    if (!open || !item) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void inventoryApi
      .listMovements({ itemId: item.id, page, limit: 10 })
      .then((result) => {
        if (cancelled) return;
        setMovements(result.data);
        setTotal(result.total);
      })
      .catch(() => {
        if (cancelled) return;
        setError('No fue posible cargar el kardex del producto.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [item, open, page]);

  // Trampa de foco, Escape, foco inicial y retorno al disparador: el hook
  // compartido evita duplicar la lógica a11y de drawers laterales.
  usePortalSideDrawerA11y(open, panelRef, onClose);

  // Difunde la apertura hacia el chrome (Sidebar, TopHeader y subnav): inerte
  // bajo el velo, que lo atenúa y desenfoca mientras el drawer viva.
  usePortalModalDrawerBroadcast(open);

  if (!open || !item) {
    return null;
  }

  const totalPages = Math.max(1, Math.ceil(total / 10));
  const titleId = `stock-item-detail-title-${item.id}`;

  return (
    <>
      <ModalLayer align="end" onVeilClick={onClose}>
        <aside
          ref={panelRef}
          tabIndex={-1}
          className="pointer-events-auto relative flex h-full w-full max-w-xl flex-col gap-4 overflow-y-auto bg-white p-6 shadow-xl dark:bg-dark-surface-2"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="portal-eyebrow">Existencias</p>
              <h2 id={titleId} className="text-xl font-semibold text-iwana-secondary-900">
                {item.name}
              </h2>
              <p className="text-sm text-iwana-secondary-700 dark:text-iwana-secondary-400">
                {item.sku}
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
          </div>

          {canAdjust && onAdjust && itemIsAdjustable ? (
            <Button type="button" onClick={() => onAdjust(item.id)}>
              Ajustar
            </Button>
          ) : null}
          {canAdjust && item && !itemIsAdjustable ? (
            <PortalAlert
              variant="info"
              title="Ajuste no disponible"
              description="Los equipos con serial no admiten ajuste manual. Usa retorno o baja según el caso."
            />
          ) : null}

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-iwana-secondary-900">Costos</h3>
            <dl className="grid gap-3 sm:grid-cols-2">
              <InventoryMetaItem
                label={INVENTORY_AVERAGE_COST_LABEL}
                value={formatInventoryCostOrNone(item.averageCost)}
              />
              <InventoryMetaItem
                label={INVENTORY_LAST_PURCHASE_COST_LABEL}
                value={formatInventoryCostOrNone(item.lastPurchaseCost)}
              />
            </dl>
            <p className="text-xs text-iwana-secondary-700 dark:text-iwana-secondary-400">
              {INVENTORY_AVERAGE_COST_HELP_TEXT}
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-iwana-secondary-900">Saldos por bodega</h3>
            {itemBalances.length === 0 ? (
              <PortalEmptyState
                title="Sin saldos"
                description="Este producto no tiene existencia registrada."
              />
            ) : (
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th scope="col" className={portalDataTableHeadClassName}>
                      Bodega
                    </th>
                    <th scope="col" className={portalDataTableHeadClassName}>
                      Lote
                    </th>
                    <th scope="col" className={portalDataTableHeadClassName}>
                      Condición
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
                  </tr>
                </thead>
                <tbody>
                  {itemBalances.map((balance) => (
                    <tr key={balance.id}>
                      <td className={portalDataTableCellClassName}>
                        {locationById.get(balance.locationId)?.name ?? balance.locationId}
                      </td>
                      <td className={portalDataTableCellClassName}>
                        {balance.lotId ? `Lote ${balance.lotId.slice(0, 8)}` : 'Sin lote'}
                      </td>
                      <td className={portalDataTableCellClassName}>
                        <Badge variant="neutral">
                          {getStockBalanceConditionLabel(balance.condition)}
                        </Badge>
                      </td>
                      <td className={`${portalDataTableCellClassName} tabular-nums`}>
                        {formatInventoryQuantity(balance.quantityOnHand)}
                      </td>
                      <td className={`${portalDataTableCellClassName} tabular-nums`}>
                        {formatInventoryQuantity(balance.quantityReserved)}
                      </td>
                      <td
                        className={`${portalDataTableCellClassName} font-medium tabular-nums text-iwana-primary dark:text-white`}
                      >
                        {formatInventoryQuantity(getAvailableQtyFromBalance(balance))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-xs text-iwana-secondary-700 dark:text-iwana-secondary-400">
              {STOCK_RESERVED_HELP_TEXT}
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-iwana-secondary-900">Kardex del producto</h3>
            {error ? (
              <PortalAlert variant="error" title="Error al cargar el kardex" description={error} />
            ) : null}
            {isLoading ? <PortalSkeletonBlock className="h-24" /> : null}
            {!isLoading && movements.length === 0 ? (
              <PortalEmptyState
                title="Sin movimientos"
                description="Aún no hay movimientos para este producto."
              />
            ) : null}
            {!isLoading && movements.length > 0 ? (
              <ul className="space-y-2">
                {movements.map((movement) => (
                  <li
                    key={movement.id}
                    className="rounded-md border border-iwana-secondary-200 p-3"
                  >
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="font-medium">{movement.movementNumber}</span>
                      <span>{formatInventoryDate(movement.createdAt)}</span>
                    </div>
                    <p className="text-sm text-iwana-secondary-700 dark:text-iwana-secondary-400">
                      {getStockMovementOriginLabel(movement.origin)}
                    </p>
                    {movement.lines.some(
                      (line) => line.unitCost != null && line.unitCost !== '',
                    ) ? (
                      <ul className="mt-1 space-y-0.5 text-xs text-iwana-secondary-700 dark:text-iwana-secondary-400">
                        {movement.lines.map((line) =>
                          line.unitCost != null && line.unitCost !== '' ? (
                            <li key={line.id}>
                              {INVENTORY_UNIT_COST_LABEL}:{' '}
                              {formatInventoryCostOrNone(line.unitCost)}
                              {line.itemSku ? ` · ${line.itemSku}` : ''}
                            </li>
                          ) : null,
                        )}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
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
              <span className="text-sm text-iwana-secondary-700 dark:text-iwana-secondary-400">
                Página {page} de {totalPages}
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
          </section>
        </aside>
      </ModalLayer>
    </>
  );
}
