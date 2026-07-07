'use client';

import { Fragment, useMemo, useState } from 'react';
import { StockLocationStatus, StockLocationType } from '@iwana/shared';
import { Button } from '@iwana/ui';
import type {
  InventoryItemRecord,
  StockBalanceRecord,
  StockLocationRecord,
} from '@/lib/api-client';
import { PortalEmptyState } from '@/components/shared/portal-ui';
import {
  formatInventoryQuantity,
  getStockBalanceConditionLabel,
  getStockLocationStatusLabel,
  getStockLocationTypeLabel,
} from './inventory-labels';

const MOBILE_LOCATION_TYPES = new Set<StockLocationType>([
  StockLocationType.MOBILE_TECHNICIAN,
  StockLocationType.MOBILE_CREW,
]);

const fieldClassName =
  'w-full rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:text-white';

export type LocationMatrixCustodyFilter = 'all' | 'mobile';

interface StockLocationsMatrixProps {
  locations: StockLocationRecord[];
  balances: StockBalanceRecord[];
  items: InventoryItemRecord[];
  custodyFilter?: LocationMatrixCustodyFilter;
  onCustodyFilterChange?: (filter: LocationMatrixCustodyFilter) => void;
  onEditLocation?: (location: StockLocationRecord) => void;
}

function formatOccupation(totalOnHand: number, maxCapacity: string | null): string {
  if (!maxCapacity) {
    return 'Sin tope';
  }

  const capacity = Number.parseFloat(maxCapacity);
  if (!Number.isFinite(capacity) || capacity <= 0) {
    return 'Sin tope';
  }

  const percent = Math.min(100, Math.round((totalOnHand / capacity) * 100));
  return `${percent} %`;
}

export function StockLocationsMatrix({
  locations,
  balances,
  items,
  custodyFilter = 'all',
  onCustodyFilterChange,
  onEditLocation,
}: StockLocationsMatrixProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | StockLocationType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | StockLocationStatus>('all');
  const [expandedLocationId, setExpandedLocationId] = useState<string | null>(null);

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

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
          locationBalances,
          balancesCount: locationBalances.length,
          uniqueItems: new Set(locationBalances.map((balance) => balance.itemId)).size,
          totalOnHand,
          occupationLabel: formatOccupation(totalOnHand, location.maxCapacity),
        };
      }),
    [balances, locations],
  );

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return rows.filter(({ location }) => {
      if (custodyFilter === 'mobile' && !MOBILE_LOCATION_TYPES.has(location.type)) {
        return false;
      }

      if (typeFilter !== 'all' && location.type !== typeFilter) {
        return false;
      }

      if (statusFilter !== 'all' && location.status !== statusFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return (
        location.name.toLowerCase().includes(normalizedSearch) ||
        location.code.toLowerCase().includes(normalizedSearch) ||
        (location.responsibleRefId ?? '').toLowerCase().includes(normalizedSearch)
      );
    });
  }, [custodyFilter, rows, search, statusFilter, typeFilter]);

  if (rows.length === 0) {
    return (
      <PortalEmptyState
        title="Sin ubicaciones disponibles"
        description="Crea bodegas y custodias para empezar a recibir y mover inventario."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[12rem] flex-1 space-y-1 text-sm">
          <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">Buscar</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Código, nombre o responsable"
            className={fieldClassName}
          />
        </label>

        <label className="min-w-[10rem] space-y-1 text-sm">
          <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">Tipo</span>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as 'all' | StockLocationType)}
            className={fieldClassName}
          >
            <option value="all">Todos</option>
            {Object.values(StockLocationType).map((type) => (
              <option key={type} value={type}>
                {getStockLocationTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-[10rem] space-y-1 text-sm">
          <span className="font-medium text-iwana-secondary-700 dark:text-gray-200">Estado</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'all' | StockLocationStatus)}
            className={fieldClassName}
          >
            <option value="all">Todos</option>
            {Object.values(StockLocationStatus).map((status) => (
              <option key={status} value={status}>
                {getStockLocationStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>

        {onCustodyFilterChange ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={custodyFilter === 'all' ? 'primary' : 'secondary'}
              onClick={() => onCustodyFilterChange('all')}
            >
              Todas las bodegas
            </Button>
            <Button
              type="button"
              size="sm"
              variant={custodyFilter === 'mobile' ? 'primary' : 'secondary'}
              onClick={() => onCustodyFilterChange('mobile')}
            >
              Custodias móviles
            </Button>
          </div>
        ) : null}
      </div>

      {filteredRows.length === 0 ? (
        <PortalEmptyState
          title="Sin resultados para los filtros aplicados"
          description="Ajusta la búsqueda o cambia el alcance de custodias móviles."
        />
      ) : (
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
                  Responsable
                </th>
                <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Capacidad
                </th>
                <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Ocupación
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
                <th className="px-4 py-3 text-right font-medium text-iwana-secondary-700 dark:text-gray-200">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
              {filteredRows.map(
                ({
                  location,
                  locationBalances,
                  balancesCount,
                  uniqueItems,
                  totalOnHand,
                  occupationLabel,
                }) => {
                  const isExpanded = expandedLocationId === location.id;

                  return (
                    <Fragment key={location.id}>
                      <tr>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {location.name}
                          </p>
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
                        <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">
                          {location.responsibleRefId ?? 'Sin responsable'}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          {location.maxCapacity
                            ? formatInventoryQuantity(location.maxCapacity)
                            : 'Sin tope'}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          {occupationLabel}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          {balancesCount}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          {uniqueItems}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          {formatInventoryQuantity(totalOnHand)}
                        </td>
                        <td className="space-x-2 px-4 py-3 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              setExpandedLocationId((current) =>
                                current === location.id ? null : location.id,
                              )
                            }
                            aria-expanded={isExpanded}
                            aria-label={`${isExpanded ? 'Ocultar' : 'Ver'} balances de ${location.name}`}
                          >
                            {isExpanded ? 'Ocultar balances' : 'Ver balances'}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => onEditLocation?.(location)}
                            aria-label={`Editar ${location.name}`}
                          >
                            Editar
                          </Button>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr key={`${location.id}-balances`}>
                          <td colSpan={10} className="bg-gray-50 px-4 py-3 dark:bg-dark-surface-2">
                            {locationBalances.length === 0 ? (
                              <p className="text-sm text-gray-600 dark:text-gray-300">
                                Esta ubicación no tiene balances visibles.
                              </p>
                            ) : (
                              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-3">
                                <table className="min-w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-gray-100 dark:border-dark-border">
                                      <th className="px-3 py-2 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                                        Ítem
                                      </th>
                                      <th className="px-3 py-2 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                                        Condición
                                      </th>
                                      <th className="px-3 py-2 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
                                        Existencia
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {locationBalances.map((balance) => {
                                      const item = itemMap.get(balance.itemId);

                                      return (
                                        <tr
                                          key={balance.id}
                                          className="border-b border-gray-50 last:border-b-0 dark:border-dark-border"
                                        >
                                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                                            {item ? `${item.sku} · ${item.name}` : balance.itemId}
                                          </td>
                                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                                            {getStockBalanceConditionLabel(balance.condition)}
                                          </td>
                                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                                            {formatInventoryQuantity(balance.quantityOnHand)}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                },
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
