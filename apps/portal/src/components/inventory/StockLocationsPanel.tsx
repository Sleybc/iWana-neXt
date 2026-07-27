'use client';

import { useMemo } from 'react';
import { Badge, Button } from '@iwana/ui';
import type { StockBalanceRecord, StockLocationRecord } from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalResultsStrip,
  PortalTablePagination,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import {
  formatInventoryQuantity,
  getStockLocationStatusBadgeVariant,
  getStockLocationStatusLabel,
  getStockLocationTypeBadgeVariant,
  getStockLocationTypeLabel,
} from './inventory-labels';
import { formatInventoryResultsLabel } from './inventory-list-pagination';

interface StockLocationsPanelProps {
  locations: StockLocationRecord[];
  balances: StockBalanceRecord[];
  userLabelById?: Map<string, string>;
  totalCount?: number;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  balancesHasMore?: boolean;
  isLoadingMoreBalances?: boolean;
  onLoadMoreBalances?: () => void;
  onCreateLocation?: () => void;
  onEditLocation?: (location: StockLocationRecord) => void;
}

function resolveOccupationLabel(totalOnHand: number, maxCapacity: string | null): string {
  if (!maxCapacity) {
    return `${formatInventoryQuantity(totalOnHand)} · Sin límite`;
  }

  const capacity = Number.parseFloat(maxCapacity);
  if (!Number.isFinite(capacity) || capacity <= 0) {
    return `${formatInventoryQuantity(totalOnHand)} · Sin límite`;
  }

  const percent = Math.min(100, Math.round((totalOnHand / capacity) * 100));
  return `${formatInventoryQuantity(totalOnHand)} / ${formatInventoryQuantity(capacity)} (${percent} %)`;
}

export function StockLocationsPanel({
  locations,
  balances,
  userLabelById,
  totalCount,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  balancesHasMore = false,
  isLoadingMoreBalances = false,
  onLoadMoreBalances,
  onCreateLocation,
  onEditLocation,
}: StockLocationsPanelProps) {
  const rows = useMemo(
    () =>
      locations.map((location) => {
        const totalOnHand = balances
          .filter((balance) => balance.locationId === location.id)
          .reduce((sum, balance) => sum + Number.parseFloat(balance.quantityOnHand), 0);

        const responsibleLabel = location.responsibleRefId
          ? (userLabelById?.get(location.responsibleRefId) ?? location.responsibleRefId)
          : 'Sin asignar';

        return {
          location,
          totalOnHand,
          occupationLabel: resolveOccupationLabel(totalOnHand, location.maxCapacity),
          responsibleLabel,
        };
      }),
    [balances, locations, userLabelById],
  );

  const resolvedTotal = totalCount ?? locations.length;
  const resultsLabel = formatInventoryResultsLabel({
    loaded: locations.length,
    total: resolvedTotal,
    hasMore,
    singular: 'bodega',
    plural: 'bodegas',
  });

  return (
    <div className="space-y-4">
      {balancesHasMore ? (
        <PortalAlert
          variant="warning"
          title="Ocupación parcial"
          description="Hay más existencias por cargar. La ocupación de bodega puede quedar corta hasta completar balances."
          action={
            onLoadMoreBalances ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                loading={isLoadingMoreBalances}
                disabled={isLoadingMoreBalances}
                onClick={onLoadMoreBalances}
              >
                Cargar más existencias
              </Button>
            ) : undefined
          }
        />
      ) : null}
      <div className="flex justify-end">
        {onCreateLocation ? (
          <Button type="button" variant="primary" onClick={onCreateLocation}>
            Crear bodega
          </Button>
        ) : null}
      </div>

      <PortalResultsStrip badge={<Badge variant="neutral">{resultsLabel}</Badge>} />

      {rows.length === 0 ? (
        <PortalEmptyState
          title="Sin bodegas"
          description="Crea la primera bodega para operar existencias."
          {...(onCreateLocation
            ? {
                action: (
                  <Button type="button" variant="primary" onClick={onCreateLocation}>
                    Crear bodega
                  </Button>
                ),
              }
            : {})}
        />
      ) : (
        <div className={portalDataTableShellClassName}>
          <table className="min-w-full">
            <thead>
              <tr>
                <th className={portalDataTableHeadClassName}>Nombre</th>
                <th className={portalDataTableHeadClassName}>Código</th>
                <th className={portalDataTableHeadClassName}>Tipo</th>
                <th className={portalDataTableHeadClassName}>Estado</th>
                <th className={portalDataTableHeadClassName}>Responsable</th>
                <th className={portalDataTableHeadClassName}>Capacidad / ocupación</th>
                <th className={portalDataTableHeadClassName}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ location, occupationLabel, responsibleLabel }) => (
                <tr key={location.id} className={portalTableRowHoverClassName}>
                  <td className={portalDataTableCellClassName}>{location.name}</td>
                  <td className={portalDataTableCellClassName}>{location.code}</td>
                  <td className={portalDataTableCellClassName}>
                    <Badge variant={getStockLocationTypeBadgeVariant(location.type)}>
                      {getStockLocationTypeLabel(location.type)}
                    </Badge>
                  </td>
                  <td className={portalDataTableCellClassName}>
                    <Badge variant={getStockLocationStatusBadgeVariant(location.status)}>
                      {getStockLocationStatusLabel(location.status)}
                    </Badge>
                  </td>
                  <td className={portalDataTableCellClassName}>{responsibleLabel}</td>
                  <td className={portalDataTableCellClassName}>{occupationLabel}</td>
                  <td className={portalDataTableCellClassName}>
                    {onEditLocation ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        aria-label={`Editar ${location.name}`}
                        onClick={() => onEditLocation(location)}
                      >
                        Editar
                      </Button>
                    ) : null}
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
              resourceLabel="bodegas"
              shown={locations.length}
              total={resolvedTotal}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
