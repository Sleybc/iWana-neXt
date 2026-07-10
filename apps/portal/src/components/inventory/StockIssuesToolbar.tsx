'use client';

import { Button, Select } from '@iwana/ui';
import { StockIssueStatus, StockIssueType } from '@iwana/shared';
import { interactiveFocusClassName, PortalSearchField } from '@/components/shared/portal-ui';
import { getStockIssueStatusLabel, getStockIssueTypeLabel } from './inventory-labels';
import { hasActiveIssueFilters, type StockIssueFilters } from './issue-filters';

interface StockIssueFilterChip {
  key: keyof StockIssueFilters;
  label: string;
}

interface StockIssuesToolbarProps {
  filters: StockIssueFilters;
  resultCount: number;
  totalCount: number;
  isRefreshing?: boolean;
  onFiltersChange: (filters: StockIssueFilters) => void;
  onRefresh: () => void;
  onClearFilters: () => void;
}

const TYPE_OPTIONS = [
  { value: '', label: 'Todos los tipos' },
  ...Object.values(StockIssueType).map((value) => ({
    value,
    label: getStockIssueTypeLabel(value),
  })),
];

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  ...Object.values(StockIssueStatus).map((value) => ({
    value,
    label: getStockIssueStatusLabel(value),
  })),
];

function buildFilterChips(filters: StockIssueFilters): StockIssueFilterChip[] {
  const chips: StockIssueFilterChip[] = [];

  if (filters.type) {
    chips.push({ key: 'type', label: getStockIssueTypeLabel(filters.type) });
  }
  if (filters.status) {
    chips.push({ key: 'status', label: getStockIssueStatusLabel(filters.status) });
  }
  if (filters.search?.trim()) {
    chips.push({ key: 'search', label: `Búsqueda: ${filters.search.trim()}` });
  }

  return chips;
}

export function StockIssuesToolbar({
  filters,
  resultCount,
  totalCount,
  isRefreshing = false,
  onFiltersChange,
  onRefresh,
  onClearFilters,
}: StockIssuesToolbarProps) {
  const chips = buildFilterChips(filters);
  const resultsLabel =
    resultCount === 0
      ? 'Sin resultados con estos filtros'
      : `${resultCount} salida${resultCount === 1 ? '' : 's'}${resultCount !== totalCount ? ` de ${totalCount}` : ''}`;

  function removeChip(key: keyof StockIssueFilters) {
    const next = { ...filters };
    delete next[key];
    onFiltersChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-gray-600 dark:text-gray-300">{resultsLabel}</p>
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

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Select
          id="issue-filter-type"
          label="Tipo de salida"
          value={filters.type ?? ''}
          onChange={(event) => {
            const next = { ...filters };
            next.type = (event.target.value as StockIssueType) || undefined;
            if (!next.type) delete next.type;
            onFiltersChange(next);
          }}
          options={TYPE_OPTIONS}
        />
        <Select
          id="issue-filter-status"
          label="Estado"
          value={filters.status ?? ''}
          onChange={(event) => {
            const next = { ...filters };
            next.status = (event.target.value as StockIssueStatus) || undefined;
            if (!next.status) delete next.status;
            onFiltersChange(next);
          }}
          options={STATUS_OPTIONS}
        />
        <PortalSearchField
          id="issue-filter-search"
          label="Buscar salidas"
          placeholder="Ubicación o referencia…"
          value={filters.search ?? ''}
          onChange={(value) => onFiltersChange({ ...filters, search: value })}
        />
      </div>

      {hasActiveIssueFilters(filters) ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
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
