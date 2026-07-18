'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button } from '@iwana/ui';
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
import {
  formatInventoryDate,
  formatInventoryQuantity,
  getStockBalanceConditionLabel,
  getStockMovementOriginLabel,
} from './inventory-labels';
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

  if (!open || !item) {
    return null;
  }

  const totalPages = Math.max(1, Math.ceil(total / 10));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="presentation">
      <aside
        className="flex h-full w-full max-w-xl flex-col gap-4 overflow-y-auto bg-white p-6 shadow-xl"
        role="dialog"
        aria-label={`Detalle de existencias de ${item.name}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="portal-eyebrow">Existencias</p>
            <h2 className="text-xl font-semibold text-iwana-secondary-900">{item.name}</h2>
            <p className="text-sm text-iwana-secondary-700">{item.sku}</p>
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
                  <th className={portalDataTableHeadClassName}>Bodega</th>
                  <th className={portalDataTableHeadClassName}>Lote</th>
                  <th className={portalDataTableHeadClassName}>Condición</th>
                  <th className={portalDataTableHeadClassName}>Existencia</th>
                  <th className={portalDataTableHeadClassName}>Reservado</th>
                </tr>
              </thead>
              <tbody>
                {itemBalances.map((balance) => (
                  <tr key={balance.id}>
                    <td className={portalDataTableCellClassName}>
                      {locationById.get(balance.locationId)?.name ?? balance.locationId}
                    </td>
                    <td className={portalDataTableCellClassName}>{balance.lotId ?? '—'}</td>
                    <td className={portalDataTableCellClassName}>
                      <Badge variant="neutral">
                        {getStockBalanceConditionLabel(balance.condition)}
                      </Badge>
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {formatInventoryQuantity(balance.quantityOnHand)}
                    </td>
                    <td className={portalDataTableCellClassName}>
                      {formatInventoryQuantity(balance.quantityReserved)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
                <li key={movement.id} className="rounded-md border border-iwana-secondary-200 p-3">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="font-medium">{movement.movementNumber}</span>
                    <span>{formatInventoryDate(movement.createdAt)}</span>
                  </div>
                  <p className="text-sm text-iwana-secondary-700">
                    {getStockMovementOriginLabel(movement.origin)}
                  </p>
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
            <span className="text-sm text-iwana-secondary-700">
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
    </div>
  );
}
