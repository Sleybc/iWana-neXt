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
  PortalActionToolbar,
  PortalEmptyState,
  PortalSearchField,
  interactiveFocusClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import {
  formatInventoryQuantity,
  getStockBalanceConditionLabel,
  getStockLocationStatusBadgeVariant,
  getStockLocationStatusLabel,
  getStockLocationTypeBadgeVariant,
  getStockLocationTypeLabel,
} from './inventory-labels';

const MOBILE_LOCATION_TYPES = new Set<StockLocationType>([
  StockLocationType.MOBILE_TECHNICIAN,
  StockLocationType.MOBILE_CREW,
]);

const tableHeadClass =
  'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400';
const cellClass = 'px-4 py-3 align-middle text-sm text-gray-700 dark:text-gray-200';

export type LocationMatrixCustodyFilter = 'all' | 'mobile';

interface StockLocationsMatrixProps {
  locations: StockLocationRecord[];
  balances: StockBalanceRecord[];
  items: InventoryItemRecord[];
  userLabelById?: Map<string, string>;
  custodyFilter?: LocationMatrixCustodyFilter;
  onCustodyFilterChange?: (filter: LocationMatrixCustodyFilter) => void;
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
    return { label: 'Sin tope', percent: null, tone: 'neutral' };
  }

  const capacity = Number.parseFloat(maxCapacity);
  if (!Number.isFinite(capacity) || capacity <= 0) {
    return { label: 'Sin tope', percent: null, tone: 'neutral' };
  }

  const percent = Math.min(100, Math.round((totalOnHand / capacity) * 100));
  const tone = percent >= 90 ? 'error' : percent >= 70 ? 'warning' : 'neutral';

  return {
    label: `${percent} %`,
    percent,
    tone,
  };
}

function hasActiveMatrixFilters(input: {
  search: string;
  typeFilter: 'all' | StockLocationType;
  statusFilter: 'all' | StockLocationStatus;
  custodyFilter: LocationMatrixCustodyFilter;
}): boolean {
  return (
    input.search.trim().length > 0 ||
    input.typeFilter !== 'all' ||
    input.statusFilter !== 'all' ||
    input.custodyFilter === 'mobile'
  );
}

export function StockLocationsMatrix({
  locations,
  balances,
  items,
  userLabelById,
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
          occupation: resolveOccupation(totalOnHand, location.maxCapacity),
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
        (location.responsibleRefId ?? '').toLowerCase().includes(normalizedSearch) ||
        (userLabelById?.get(location.responsibleRefId ?? '') ?? '')
          .toLowerCase()
          .includes(normalizedSearch)
      );
    });
  }, [custodyFilter, rows, search, statusFilter, typeFilter, userLabelById]);

  const mobileCount = useMemo(
    () => rows.filter(({ location }) => MOBILE_LOCATION_TYPES.has(location.type)).length,
    [rows],
  );

  const withStockCount = useMemo(
    () => filteredRows.filter(({ totalOnHand }) => totalOnHand > 0).length,
    [filteredRows],
  );

  const filterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];

    if (custodyFilter === 'mobile' && onCustodyFilterChange) {
      chips.push({
        key: 'custody',
        label: 'Custodias móviles',
        onRemove: () => onCustodyFilterChange('all'),
      });
    }

    if (typeFilter !== 'all') {
      chips.push({
        key: 'type',
        label: getStockLocationTypeLabel(typeFilter),
        onRemove: () => setTypeFilter('all'),
      });
    }

    if (statusFilter !== 'all') {
      chips.push({
        key: 'status',
        label: getStockLocationStatusLabel(statusFilter),
        onRemove: () => setStatusFilter('all'),
      });
    }

    if (search.trim()) {
      chips.push({
        key: 'search',
        label: `Búsqueda: ${search.trim()}`,
        onRemove: () => setSearch(''),
      });
    }

    return chips;
  }, [custodyFilter, onCustodyFilterChange, search, statusFilter, typeFilter]);

  function clearFilters() {
    setSearch('');
    setTypeFilter('all');
    setStatusFilter('all');
    onCustodyFilterChange?.('all');
  }

  if (rows.length === 0) {
    return (
      <PortalEmptyState
        title="Sin ubicaciones disponibles"
        description="Crea bodegas y custodias para empezar a recibir y mover inventario."
        icon={Warehouse}
      />
    );
  }

  const resultLabel =
    filteredRows.length === rows.length
      ? `${filteredRows.length} ubicaciones`
      : `${filteredRows.length} de ${rows.length} ubicaciones`;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-dark-border dark:bg-dark-surface-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-iwana-secondary-700 dark:text-iwana-secondary">
            Ubicaciones visibles
          </p>
          <p className="mt-2 text-2xl font-semibold text-iwana-primary dark:text-white">
            {resultLabel}
          </p>
        </article>
        <article className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-dark-border dark:bg-dark-surface-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-iwana-secondary-700 dark:text-iwana-secondary">
            Custodias móviles
          </p>
          <p className="mt-2 text-2xl font-semibold text-iwana-primary dark:text-white">
            {mobileCount}
          </p>
        </article>
        <article className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-dark-border dark:bg-dark-surface-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-iwana-secondary-700 dark:text-iwana-secondary">
            Con existencia en vista
          </p>
          <p className="mt-2 text-2xl font-semibold text-iwana-primary dark:text-white">
            {withStockCount}
          </p>
        </article>
      </div>

      <div className="space-y-3 border-b border-gray-100 pb-4 dark:border-dark-border">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_200px_200px_auto] xl:items-end">
          <PortalSearchField
            id="locations-matrix-search"
            label="Buscar bodega"
            placeholder="Código, nombre o responsable"
            value={search}
            onChange={setSearch}
          />
          <Select
            label="Tipo"
            className="h-12"
            value={typeFilter}
            options={[
              { value: 'all', label: 'Todos los tipos' },
              ...Object.values(StockLocationType).map((type) => ({
                value: type,
                label: getStockLocationTypeLabel(type),
              })),
            ]}
            onChange={(event) => setTypeFilter(event.target.value as 'all' | StockLocationType)}
          />
          <Select
            label="Estado"
            className="h-12"
            value={statusFilter}
            options={[
              { value: 'all', label: 'Todos los estados' },
              ...Object.values(StockLocationStatus).map((status) => ({
                value: status,
                label: getStockLocationStatusLabel(status),
              })),
            ]}
            onChange={(event) => setStatusFilter(event.target.value as 'all' | StockLocationStatus)}
          />
          {hasActiveMatrixFilters({ search, typeFilter, statusFilter, custodyFilter }) ? (
            <Button type="button" variant="secondary" className="h-12 px-4" onClick={clearFilters}>
              Limpiar filtros
            </Button>
          ) : null}
        </div>

        {onCustodyFilterChange ? (
          <PortalActionToolbar compact>
            <Button
              type="button"
              size="sm"
              variant={custodyFilter === 'all' ? 'primary' : 'ghost'}
              className={cn(
                'rounded-xl',
                custodyFilter !== 'all' && 'text-iwana-secondary-700 dark:text-gray-300',
              )}
              onClick={() => onCustodyFilterChange('all')}
            >
              Todas las bodegas
            </Button>
            <Button
              type="button"
              size="sm"
              variant={custodyFilter === 'mobile' ? 'primary' : 'ghost'}
              className={cn(
                'rounded-xl',
                custodyFilter !== 'mobile' && 'text-iwana-secondary-700 dark:text-gray-300',
              )}
              onClick={() => onCustodyFilterChange('mobile')}
            >
              Custodias móviles
            </Button>
          </PortalActionToolbar>
        ) : null}

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
          title="Sin resultados para los filtros aplicados"
          description="Ajusta la búsqueda o limpia los filtros para ampliar el listado."
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
                  <th className={tableHeadClass}>Ubicación</th>
                  <th className={tableHeadClass}>Tipo</th>
                  <th className={tableHeadClass}>Estado</th>
                  <th className={`${tableHeadClass} hidden lg:table-cell`}>Responsable</th>
                  <th className={`${tableHeadClass} hidden md:table-cell`}>Capacidad</th>
                  <th className={tableHeadClass}>Ocupación</th>
                  <th className={`${tableHeadClass} hidden xl:table-cell`}>Balances</th>
                  <th className={`${tableHeadClass} hidden xl:table-cell`}>Ítems</th>
                  <th className={tableHeadClass}>Existencia</th>
                  <th className={`${tableHeadClass} text-right`}>Acciones</th>
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
                          <td className={cellClass}>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {location.name}
                            </p>
                            <p className="mt-0.5 font-mono text-xs text-gray-500 dark:text-gray-400">
                              {location.code}
                            </p>
                          </td>
                          <td className={cellClass}>
                            <Badge variant={getStockLocationTypeBadgeVariant(location.type)}>
                              {getStockLocationTypeLabel(location.type)}
                            </Badge>
                          </td>
                          <td className={cellClass}>
                            <Badge variant={getStockLocationStatusBadgeVariant(location.status)}>
                              {getStockLocationStatusLabel(location.status)}
                            </Badge>
                          </td>
                          <td
                            className={`${cellClass} hidden text-sm lg:table-cell`}
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
                          <td className={`${cellClass} hidden md:table-cell`}>
                            {location.maxCapacity
                              ? formatInventoryQuantity(location.maxCapacity)
                              : 'Sin tope'}
                          </td>
                          <td className={cellClass}>
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
                          <td className={`${cellClass} hidden xl:table-cell`}>{balancesCount}</td>
                          <td className={`${cellClass} hidden xl:table-cell`}>{uniqueItems}</td>
                          <td className={cellClass}>
                            <span className="font-semibold text-iwana-primary dark:text-white">
                              {formatInventoryQuantity(totalOnHand)}
                            </span>
                          </td>
                          <td className={`${cellClass} text-right`}>
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
                                aria-label={`${isExpanded ? 'Ocultar' : 'Ver'} balances de ${location.name}`}
                              >
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                )}
                                <span className="sr-only">
                                  {isExpanded ? 'Ocultar balances' : 'Ver balances'}
                                </span>
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => onEditLocation?.(location)}
                                aria-label={`Editar ${location.name}`}
                              >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                                <span className="sr-only">Editar</span>
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr key={`${location.id}-balances`}>
                            <td
                              colSpan={10}
                              className="bg-iwana-surface-soft/70 px-4 py-4 dark:bg-dark-surface-2/70"
                            >
                              <div className="border-l-2 border-iwana-primary pl-4">
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                  Balances en {location.name}
                                </p>
                                {locationBalances.length === 0 ? (
                                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                                    Esta ubicación no tiene balances visibles.
                                  </p>
                                ) : (
                                  <div className="mt-3 overflow-x-auto">
                                    <table className="w-full min-w-[640px] text-sm">
                                      <thead>
                                        <tr className="border-b border-gray-200 dark:border-dark-border">
                                          <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                                            Ítem
                                          </th>
                                          <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                                            Condición
                                          </th>
                                          <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
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
                                              <td className="px-3 py-2 font-medium text-iwana-primary dark:text-white">
                                                {formatInventoryQuantity(balance.quantityOnHand)}
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
