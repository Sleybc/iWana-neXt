'use client';

import { Button, Input, Select } from '@iwana/ui';
import { PurchaseRequestPriority, PurchaseRequestStatus, PurchaseRequestType } from '@iwana/shared';
import { interactiveFocusClassName } from '@/components/shared/portal-ui';
import {
  getPurchaseRequestPriorityLabel,
  getPurchaseRequestStatusLabel,
  getPurchaseRequestTypeLabel,
} from './inventory-labels';
import {
  PURCHASE_KPI_LABELS,
  type PurchaseKpiPreset,
  type PurchaseRequestFilters,
  hasActivePurchaseFilters,
} from './purchase-filters';

interface PurchaseRequestsToolbarProps {
  filters: PurchaseRequestFilters;
  resultCount: number;
  totalCount: number;
  isRefreshing?: boolean;
  onFiltersChange: (filters: PurchaseRequestFilters) => void;
  onRefresh: () => void;
  onClearFilters: () => void;
  onOpenComposer?: () => void;
}

const TYPE_OPTIONS = [
  { value: '', label: 'Todos los tipos' },
  ...Object.values(PurchaseRequestType).map((value) => ({
    value,
    label: getPurchaseRequestTypeLabel(value),
  })),
];

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  ...Object.values(PurchaseRequestStatus).map((value) => ({
    value,
    label: getPurchaseRequestStatusLabel(value),
  })),
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'Todas las prioridades' },
  ...Object.values(PurchaseRequestPriority).map((value) => ({
    value,
    label: getPurchaseRequestPriorityLabel(value),
  })),
];

function buildFilterChips(filters: PurchaseRequestFilters): Array<{ key: string; label: string }> {
  const chips: Array<{ key: string; label: string }> = [];

  if (filters.kpiPreset) {
    chips.push({
      key: 'kpiPreset',
      label: PURCHASE_KPI_LABELS[filters.kpiPreset as PurchaseKpiPreset],
    });
  }
  if (filters.requestType) {
    chips.push({ key: 'requestType', label: getPurchaseRequestTypeLabel(filters.requestType) });
  }
  if (filters.status && !filters.kpiPreset) {
    chips.push({ key: 'status', label: getPurchaseRequestStatusLabel(filters.status) });
  }
  if (filters.priority && filters.kpiPreset !== 'urgent') {
    chips.push({ key: 'priority', label: getPurchaseRequestPriorityLabel(filters.priority) });
  }
  if (filters.search?.trim()) {
    chips.push({ key: 'search', label: `Búsqueda: ${filters.search.trim()}` });
  }

  return chips;
}

export function PurchaseRequestsToolbar({
  filters,
  resultCount,
  totalCount,
  isRefreshing = false,
  onFiltersChange,
  onRefresh,
  onClearFilters,
  onOpenComposer,
}: PurchaseRequestsToolbarProps) {
  const chips = buildFilterChips(filters);
  const resultsLabel =
    resultCount === 0
      ? 'Sin resultados con estos filtros'
      : `${resultCount} solicitud${resultCount === 1 ? '' : 'es'}${resultCount !== totalCount ? ` de ${totalCount}` : ''}`;

  function removeChip(key: string) {
    if (key === 'kpiPreset') {
      const next = { ...filters };
      delete next.kpiPreset;
      if (filters.kpiPreset === 'urgent') delete next.priority;
      if (
        filters.kpiPreset &&
        ['pendingQuotes', 'pendingApproval', 'readyForPo', 'pendingReceipt'].includes(
          filters.kpiPreset,
        )
      ) {
        delete next.status;
      }
      onFiltersChange(next);
      return;
    }

    const next = { ...filters };
    delete (next as Record<string, unknown>)[key];
    onFiltersChange(next);
  }

  function clearKpiPreset(filters: PurchaseRequestFilters): PurchaseRequestFilters {
    const next = { ...filters };
    delete next.kpiPreset;
    return next;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-gray-600 dark:text-gray-300">{resultsLabel}</p>
        <div className="flex flex-wrap items-center gap-2">
          {onOpenComposer ? (
            <Button type="button" variant="secondary" onClick={onOpenComposer}>
              Nueva solicitud
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            className={interactiveFocusClassName}
            disabled={isRefreshing}
            onClick={onRefresh}
          >
            {isRefreshing ? 'Actualizando…' : 'Actualizar'}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Select
          id="purchase-filter-type"
          label="Tipo de compra"
          value={filters.requestType ?? ''}
          onChange={(event) => {
            const next = clearKpiPreset(filters);
            next.requestType = (event.target.value as PurchaseRequestType) || undefined;
            if (!next.requestType) delete next.requestType;
            onFiltersChange(next);
          }}
          options={TYPE_OPTIONS}
        />
        <Select
          id="purchase-filter-status"
          label="Estado"
          value={filters.status ?? ''}
          onChange={(event) => {
            const next = clearKpiPreset(filters);
            next.status = (event.target.value as PurchaseRequestStatus) || undefined;
            if (!next.status) delete next.status;
            onFiltersChange(next);
          }}
          options={STATUS_OPTIONS}
        />
        <Select
          id="purchase-filter-priority"
          label="Prioridad"
          value={filters.priority ?? ''}
          onChange={(event) => {
            const next = clearKpiPreset(filters);
            next.priority = (event.target.value as PurchaseRequestPriority) || undefined;
            if (!next.priority) delete next.priority;
            onFiltersChange(next);
          }}
          options={PRIORITY_OPTIONS}
        />
        <Input
          id="purchase-filter-search"
          label="Buscar"
          placeholder="Número, título o área"
          value={filters.search ?? ''}
          onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })}
        />
      </div>

      {hasActivePurchaseFilters(filters) ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              aria-label={`Quitar filtro: ${chip.label}`}
              className={`inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 ${interactiveFocusClassName}`}
              onClick={() => removeChip(chip.key)}
            >
              {chip.label}
              <span aria-hidden>×</span>
            </button>
          ))}
          <button
            type="button"
            className={`text-xs font-medium text-iwana-primary underline-offset-4 hover:underline ${interactiveFocusClassName}`}
            onClick={onClearFilters}
          >
            Limpiar filtros
          </button>
        </div>
      ) : null}
    </div>
  );
}
