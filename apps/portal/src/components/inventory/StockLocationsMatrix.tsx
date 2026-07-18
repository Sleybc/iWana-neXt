'use client';

import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Pencil, Warehouse } from 'lucide-react';
import { StockLocationStatus, StockLocationType } from '@iwana/shared';
import { Badge, Button, Select, cn } from '@iwana/ui';
import type {
  InventoryItemRecord,
  StockBalanceRecord,
  StockLocationRecord,
} from '@/lib/api-client';
import {
  PortalEmptyState,
  PortalSearchField,
  interactiveFocusClassName,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableNestedHeadClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import {
  EMPTY_LOCATION_MATRIX_FILTERS,
  type LocationMatrixCustodyFilter,
  type LocationMatrixFilters,
  hasActiveLocationMatrixFilters,
  matchesLocationMatrixFilters,
  resolveLocationStatusSelectValue,
} from './location-matrix-filters';
import { StockLocationsMatrixSkeleton } from './StockLocationsMatrixSkeleton';
import {
  formatInventoryQuantity,
  getStockBalanceConditionLabel,
  getStockLocationStatusBadgeVariant,
  getStockLocationStatusLabel,
  getStockLocationTypeBadgeVariant,
  getStockLocationTypeLabel,
} from './inventory-labels';

export type { LocationMatrixCustodyFilter } from './location-matrix-filters';

interface StockLocationsMatrixProps {
  locations: StockLocationRecord[];
  balances: StockBalanceRecord[];
  items: InventoryItemRecord[];
  userLabelById?: Map<string, string>;
  custodyFilter?: LocationMatrixCustodyFilter;
  isLoading?: boolean;
  onCustodyFilterChange?: (filter: LocationMatrixCustodyFilter) => void;
  onCreateLocation?: () => void;
  onEditLocation?: (location: StockLocationRecord) => void;
}

interface OccupationMeta {
  label: string;
  percent: number | null;
  tone: 'neutral' | 'warning' | 'error';
}

function formatResponsibleRef(
  ref: string | null,
  userLabelById?: Map<string, string>,
): { label: string; title?: string } {
  if (!ref) {
    return { label: 'Sin asignar' };
  }

  const userLabel = userLabelById?.get(ref);
  if (userLabel) {
    return { label: userLabel, title: userLabel };
  }

  if (ref.length <= 16) {
    return { label: ref, title: ref };
  }

  return {
    label: `${ref.slice(0, 8)}…${ref.slice(-4)}`,
    title: ref,
  };
}

function resolveOccupation(totalOnHand: number, maxCapacity: string | null): OccupationMeta {
  if (!maxCapacity) {
    return { label: 'Sin límite', percent: null, tone: 'neutral' };
  }

  const capacity = Number.parseFloat(maxCapacity);
  if (!Number.isFinite(capacity) || capacity <= 0) {
    return { label: 'Sin límite', percent: null, tone: 'neutral' };
  }

  const percent = Math.min(100, Math.round((totalOnHand / capacity) * 100));
  const tone = percent >= 90 ? 'error' : percent >= 70 ? 'warning' : 'neutral';

  return {
    label: `${percent} %`,
    percent,
    tone,
  };
}

export function StockLocationsMatrix({
  locations,
  balances,
  items,
  userLabelById,
  custodyFilter = 'all',
  isLoading = false,
  onCustodyFilterChange,
  onCreateLocation,
  onEditLocation,
}: StockLocationsMatrixProps) {
  const [localFilters, setLocalFilters] = useState<Omit<LocationMatrixFilters, 'custodyFilter'>>({
    search: EMPTY_LOCATION_MATRIX_FILTERS.search,
    typeFilter: EMPTY_LOCATION_MATRIX_FILTERS.typeFilter,
    statusFilter: EMPTY_LOCATION_MATRIX_FILTERS.statusFilter,
    stockFilter: EMPTY_LOCATION_MATRIX_FILTERS.stockFilter,
  });
  const [expandedLocationId, setExpandedLocationId] = useState<string | null>(null);

  const effectiveFilters = useMemo<LocationMatrixFilters>(
    () => ({
      ...localFilters,
      custodyFilter,
    }),
    [custodyFilter, localFilters],
  );

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const rows = useMemo(
    () =>
      locations.map((location) => {
        const locationBalances = balances.filter((balance) => balance.locationId === location.id);
        const totalOnHand = locationBalances.reduce(
          (sum, balance) => sum + Number.parseFloat(balance.quantityOnHand),
          0,
        );
        const totalReserved = locationBalances.reduce(
          (sum, balance) => sum + Number.parseFloat(balance.quantityReserved),
          0,
        );
        const totalAvailable = totalOnHand - totalReserved;

        return {
          location,
          locationBalances,
          balancesCount: locationBalances.length,
          uniqueItems: new Set(locationBalances.map((balance) => balance.itemId)).size,
          totalOnHand,
          totalReserved,
          totalAvailable,
          occupation: resolveOccupation(totalOnHand, location.maxCapacity),
        };
      }),
    [balances, locations],
  );

  const filteredRows = useMemo(() => {
    const normalizedSearch = effectiveFilters.search.trim().toLowerCase();

    return rows.filter(({ location, totalOnHand }) => {
      if (
        !matchesLocationMatrixFilters(location, { ...effectiveFilters, search: '' }, totalOnHand)
      ) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return (
        location.name.toLowerCase().includes(normalizedSearch) ||
        location.code.toLowerCase().includes(normalizedSearch) ||
        (location.responsibleRefId ?? '').toLowerCase().includes(normalizedSearch) ||
        (userLabelById?.get(location.responsibleRefId ?? '') ?? '')
          .toLowerCase()
          .includes(normalizedSearch)
      );
    });
  }, [effectiveFilters, rows, userLabelById]);

  const filterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];

    if (effectiveFilters.custodyFilter === 'mobile' && onCustodyFilterChange) {
      chips.push({
        key: 'custody',
        label: 'Con técnicos en campo',
        onRemove: () => onCustodyFilterChange('all'),
      });
    }

    if (effectiveFilters.typeFilter !== 'all') {
      chips.push({
        key: 'type',
        label: getStockLocationTypeLabel(effectiveFilters.typeFilter),
        onRemove: () => setLocalFilters((current) => ({ ...current, typeFilter: 'all' })),
      });
    }

    if (effectiveFilters.statusFilter === 'inactive_group') {
      chips.push({
        key: 'status',
        label: 'Pausadas o guardadas',
        onRemove: () => setLocalFilters((current) => ({ ...current, statusFilter: 'all' })),
      });
    } else if (effectiveFilters.statusFilter !== 'all') {
      chips.push({
        key: 'status',
        label: getStockLocationStatusLabel(effectiveFilters.statusFilter),
        onRemove: () => setLocalFilters((current) => ({ ...current, statusFilter: 'all' })),
      });
    }

    if (effectiveFilters.stockFilter === 'withStock') {
      chips.push({
        key: 'stock',
        label: 'Con material disponible',
        onRemove: () => setLocalFilters((current) => ({ ...current, stockFilter: 'all' })),
      });
    }

    if (effectiveFilters.search.trim()) {
      chips.push({
        key: 'search',
        label: `Búsqueda: ${effectiveFilters.search.trim()}`,
        onRemove: () => setLocalFilters((current) => ({ ...current, search: '' })),
      });
    }

    return chips;
  }, [effectiveFilters, onCustodyFilterChange]);

  function clearFilters() {
    setLocalFilters({
      search: '',
      typeFilter: 'all',
      statusFilter: 'all',
      stockFilter: 'all',
    });
    onCustodyFilterChange?.('all');
  }

  if (isLoading) {
    return <StockLocationsMatrixSkeleton />;
  }

  if (rows.length === 0) {
    return (
      <PortalEmptyState
        title="Sin bodegas creadas"
        description="Crea la primera bodega para empezar a recibir y mover material."
        icon={Warehouse}
        action={
          onCreateLocation ? (
            <Button type="button" onClick={onCreateLocation}>
              Crear bodega
            </Button>
          ) : undefined
        }
      />
    );
  }

  const resultLabel =
    filteredRows.length === rows.length
      ? `${filteredRows.length} ubicaciones`
      : `${filteredRows.length} de ${rows.length} ubicaciones`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{resultLabel}</p>
      </div>

      <div className="space-y-3 border-b border-gray-100 pb-4 dark:border-dark-border">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_200px_200px_auto] xl:items-end">
          <PortalSearchField
            id="locations-matrix-search"
            label="Buscar bodega"
            placeholder="Código, nombre o responsable"
            value={localFilters.search}
            onChange={(value) => setLocalFilters((current) => ({ ...current, search: value }))}
          />
          <Select
            label="Tipo"
            className="h-12"
            value={localFilters.typeFilter}
            options={[
              { value: 'all', label: 'Todos los tipos' },
              ...Object.values(StockLocationType).map((type) => ({
                value: type,
                label: getStockLocationTypeLabel(type),
              })),
            ]}
            onChange={(event) =>
              setLocalFilters((current) => ({
                ...current,
                typeFilter: event.target.value as 'all' | StockLocationType,
              }))
            }
          />
          <Select
            label="Estado"
            className="h-12"
            value={resolveLocationStatusSelectValue(localFilters.statusFilter)}
            options={[
              { value: 'all', label: 'Todos los estados' },
              ...Object.values(StockLocationStatus).map((status) => ({
                value: status,
                label: getStockLocationStatusLabel(status),
              })),
            ]}
            onChange={(event) =>
              setLocalFilters((current) => ({
                ...current,
                statusFilter: event.target.value as 'all' | StockLocationStatus,
              }))
            }
          />
          {hasActiveLocationMatrixFilters(effectiveFilters) ? (
            <Button type="button" variant="secondary" className="h-12 px-4" onClick={clearFilters}>
              Limpiar filtros
            </Button>
          ) : null}
        </div>

        {filterChips.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {filterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                aria-label={`Quitar filtro ${chip.label}`}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border border-gray-200 bg-iwana-surface-soft px-3 py-1 text-xs font-medium text-iwana-secondary-700 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-200',
                  interactiveFocusClassName,
                )}
                onClick={chip.onRemove}
              >
                {chip.label}
                <span aria-hidden>×</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {filteredRows.length === 0 ? (
        <PortalEmptyState
          title="Sin resultados con esta búsqueda"
          description="Cambia la búsqueda o limpia los filtros para ver más bodegas."
          action={
            <Button type="button" variant="secondary" onClick={clearFilters}>
              Limpiar filtros
            </Button>
          }
        />
      ) : (
        <div className={portalDataTableShellClassName}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-iwana-surface-soft dark:border-dark-border dark:bg-dark-surface-3">
                  <th scope="col" className={portalDataTableHeadClassName}>
                    Bodega
                  </th>
                  <th scope="col" className={portalDataTableHeadClassName}>
                    Tipo
                  </th>
                  <th scope="col" className={portalDataTableHeadClassName}>
                    Estado
                  </th>
                  <th
                    scope="col"
                    className={cn(portalDataTableHeadClassName, 'hidden lg:table-cell')}
                  >
                    Persona a cargo
                  </th>
                  <th
                    scope="col"
                    className={cn(portalDataTableHeadClassName, 'hidden md:table-cell')}
                  >
                    Capacidad
                  </th>
                  <th scope="col" className={portalDataTableHeadClassName}>
                    Uso
                  </th>
                  <th
                    scope="col"
                    className={cn(portalDataTableHeadClassName, 'hidden xl:table-cell')}
                  >
                    Detalles
                  </th>
                  <th
                    scope="col"
                    className={cn(portalDataTableHeadClassName, 'hidden xl:table-cell')}
                  >
                    Productos
                  </th>
                  <th
                    scope="col"
                    className={cn(portalDataTableHeadClassName, 'hidden lg:table-cell')}
                  >
                    Existencia
                  </th>
                  <th
                    scope="col"
                    className={cn(portalDataTableHeadClassName, 'hidden lg:table-cell')}
                  >
                    Reservado
                  </th>
                  <th scope="col" className={portalDataTableHeadClassName}>
                    Disponible
                  </th>
                  <th scope="col" className={cn(portalDataTableHeadClassName, 'text-right')}>
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(
                  ({
                    location,
                    locationBalances,
                    balancesCount,
                    uniqueItems,
                    totalOnHand,
                    totalReserved,
                    totalAvailable,
                    occupation,
                  }) => {
                    const isExpanded = expandedLocationId === location.id;
                    const responsible = formatResponsibleRef(
                      location.responsibleRefId,
                      userLabelById,
                    );

                    return (
                      <Fragment key={location.id}>
                        <tr className={portalTableRowHoverClassName}>
                          <td className={portalDataTableCellClassName}>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {location.name}
                            </p>
                            <p className="mt-0.5 font-mono text-xs text-gray-500 dark:text-gray-400">
                              {location.code}
                            </p>
                          </td>
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
                          <td
                            className={cn(
                              portalDataTableCellClassName,
                              'hidden text-sm lg:table-cell',
                            )}
                            title={responsible.title}
                          >
                            <span
                              className={cn(
                                location.responsibleRefId
                                  ? 'text-gray-700 dark:text-gray-300'
                                  : 'text-gray-500 dark:text-gray-400',
                              )}
                            >
                              {responsible.label}
                            </span>
                          </td>
                          <td className={cn(portalDataTableCellClassName, 'hidden md:table-cell')}>
                            {location.maxCapacity
                              ? formatInventoryQuantity(location.maxCapacity)
                              : 'Sin límite'}
                          </td>
                          <td className={portalDataTableCellClassName}>
                            <div className="space-y-1.5">
                              <span
                                className={cn(
                                  'text-sm font-medium',
                                  occupation.tone === 'error'
                                    ? 'text-red-700 dark:text-red-300'
                                    : occupation.tone === 'warning'
                                      ? 'text-amber-700 dark:text-amber-300'
                                      : 'text-gray-700 dark:text-gray-300',
                                )}
                              >
                                {occupation.label}
                              </span>
                              {occupation.percent != null ? (
                                <div
                                  className="h-1.5 w-full max-w-[7rem] overflow-hidden rounded-full bg-gray-100 dark:bg-dark-surface-2"
                                  role="presentation"
                                >
                                  <div
                                    className={cn(
                                      'h-full rounded-full transition-[width] duration-200',
                                      occupation.tone === 'error'
                                        ? 'bg-red-500'
                                        : occupation.tone === 'warning'
                                          ? 'bg-amber-500'
                                          : 'bg-iwana-primary',
                                    )}
                                    style={{ width: `${occupation.percent}%` }}
                                  />
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td className={cn(portalDataTableCellClassName, 'hidden xl:table-cell')}>
                            {balancesCount}
                          </td>
                          <td className={cn(portalDataTableCellClassName, 'hidden xl:table-cell')}>
                            {uniqueItems}
                          </td>
                          <td className={cn(portalDataTableCellClassName, 'hidden lg:table-cell')}>
                            <span className="text-gray-700 dark:text-gray-300">
                              {formatInventoryQuantity(totalOnHand)}
                            </span>
                          </td>
                          <td className={cn(portalDataTableCellClassName, 'hidden lg:table-cell')}>
                            <span className="text-gray-700 dark:text-gray-300">
                              {formatInventoryQuantity(totalReserved)}
                            </span>
                          </td>
                          <td className={portalDataTableCellClassName}>
                            <span className="font-semibold text-iwana-primary dark:text-white">
                              {formatInventoryQuantity(totalAvailable)}
                            </span>
                          </td>
                          <td className={cn(portalDataTableCellClassName, 'text-right')}>
                            <div className="flex justify-end gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setExpandedLocationId((current) =>
                                    current === location.id ? null : location.id,
                                  )
                                }
                                aria-expanded={isExpanded}
                                aria-label={`${isExpanded ? 'Ocultar' : 'Ver'} existencias de ${location.name}`}
                              >
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                )}
                                <span className="sr-only">
                                  {isExpanded ? 'Ocultar existencias' : 'Ver existencias'}
                                </span>
                              </Button>
                              {onEditLocation ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => onEditLocation(location)}
                                  aria-label={`Editar ${location.name}`}
                                >
                                  <Pencil className="h-4 w-4" aria-hidden="true" />
                                  <span className="sr-only">Editar</span>
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr key={`${location.id}-balances`}>
                            <td
                              colSpan={12}
                              className="bg-iwana-surface-soft/70 px-4 py-4 dark:bg-dark-surface-2/70"
                            >
                              <div className="border-l-2 border-iwana-primary pl-4">
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                  Material en {location.name}
                                </p>
                                {locationBalances.length === 0 ? (
                                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                                    Esta bodega todavía no tiene material registrado.
                                  </p>
                                ) : (
                                  <div className="mt-3 overflow-x-auto">
                                    <table className="w-full min-w-[640px] text-sm">
                                      <thead>
                                        <tr className="border-b border-gray-200 dark:border-dark-border">
                                          <th
                                            scope="col"
                                            className={portalDataTableNestedHeadClassName}
                                          >
                                            Producto
                                          </th>
                                          <th
                                            scope="col"
                                            className={portalDataTableNestedHeadClassName}
                                          >
                                            Condición
                                          </th>
                                          <th
                                            scope="col"
                                            className={portalDataTableNestedHeadClassName}
                                          >
                                            Existencia
                                          </th>
                                          <th
                                            scope="col"
                                            className={portalDataTableNestedHeadClassName}
                                          >
                                            Reservado
                                          </th>
                                          <th
                                            scope="col"
                                            className={portalDataTableNestedHeadClassName}
                                          >
                                            Disponible
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {locationBalances.map((balance) => {
                                          const item = itemMap.get(balance.itemId);
                                          const onHand = Number.parseFloat(balance.quantityOnHand);
                                          const reserved = Number.parseFloat(
                                            balance.quantityReserved,
                                          );
                                          const available = onHand - reserved;

                                          return (
                                            <tr
                                              key={balance.id}
                                              className="border-b border-gray-100 last:border-b-0 dark:border-dark-border"
                                            >
                                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                                                {item
                                                  ? `${item.sku} · ${item.name}`
                                                  : balance.itemId}
                                              </td>
                                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                                                {getStockBalanceConditionLabel(balance.condition)}
                                              </td>
                                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                                                {formatInventoryQuantity(balance.quantityOnHand)}
                                              </td>
                                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                                                {formatInventoryQuantity(balance.quantityReserved)}
                                              </td>
                                              <td className="px-3 py-2 font-medium text-iwana-primary dark:text-white">
                                                {formatInventoryQuantity(available)}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
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
        </div>
      )}
    </div>
  );
}
