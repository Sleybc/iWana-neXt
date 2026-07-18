'use client';

import { useMemo } from 'react';
import { Badge, Button } from '@iwana/ui';
import type { StockBalanceRecord, StockLocationRecord } from '@/lib/api-client';
import {
  PortalEmptyState,
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

interface StockLocationsPanelProps {
  locations: StockLocationRecord[];
  balances: StockBalanceRecord[];
  userLabelById?: Map<string, string>;
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

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {onCreateLocation ? (
          <Button type="button" onClick={onCreateLocation}>
            Crear bodega
          </Button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <PortalEmptyState
          title="Sin bodegas"
          description="Crea la primera bodega para operar existencias."
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
        </div>
      )}
    </div>
  );
}
