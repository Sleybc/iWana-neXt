'use client';

import { useMemo } from 'react';
import type { StockBalanceRecord, StockLocationRecord } from '@/lib/api-client';
import { PortalEmptyState } from '@/components/shared/portal-ui';
import {
  formatInventoryQuantity,
  getStockLocationStatusLabel,
  getStockLocationTypeLabel,
} from './inventory-labels';

interface StockLocationsMatrixProps {
  locations: StockLocationRecord[];
  balances: StockBalanceRecord[];
}

export function StockLocationsMatrix({ locations, balances }: StockLocationsMatrixProps) {
  const rows = useMemo(
    () =>
      locations.map((location) => {
        const locationBalances = balances.filter((balance) => balance.locationId === location.id);
        const totalOnHand = locationBalances.reduce(
          (sum, balance) => sum + Number.parseFloat(balance.quantityOnHand),
          0,
        );

        return {
          location,
          balancesCount: locationBalances.length,
          uniqueItems: new Set(locationBalances.map((balance) => balance.itemId)).size,
          totalOnHand,
        };
      }),
    [balances, locations],
  );

  if (rows.length === 0) {
    return (
      <PortalEmptyState
        title="Sin ubicaciones disponibles"
        description="Crea bodegas y custodias para empezar a recibir y mover inventario."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-3">
      <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-border">
        <thead className="bg-gray-50 dark:bg-dark-surface-2">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
              Ubicación
            </th>
            <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
              Tipo
            </th>
            <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
              Estado
            </th>
            <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
              Balances
            </th>
            <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
              Ítems distintos
            </th>
            <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
              Existencia
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
          {rows.map(({ location, balancesCount, uniqueItems, totalOnHand }) => (
            <tr key={location.id}>
              <td className="px-4 py-3">
                <p className="font-medium text-gray-900 dark:text-white">{location.name}</p>
                <p className="font-mono text-xs text-gray-500 dark:text-gray-400">
                  {location.code}
                </p>
              </td>
              <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                {getStockLocationTypeLabel(location.type)}
              </td>
              <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                {getStockLocationStatusLabel(location.status)}
              </td>
              <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{balancesCount}</td>
              <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{uniqueItems}</td>
              <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                {formatInventoryQuantity(totalOnHand)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
