'use client';

import { Button, Input, Select } from '@iwana/ui';
import {
  InventoryItemKind,
  InventoryItemStatus,
  InventoryTrackingMode,
} from '@iwana/shared';
import { interactiveFocusClassName } from '@/components/shared/portal-ui';
import {
  getInventoryItemKindLabel,
  getInventoryItemStatusLabel,
  getInventoryTrackingModeLabel,
} from './inventory-labels';
import { type CatalogFilters, hasActiveCatalogFilters } from './catalog-filters';

interface CategoryOption {
  value: string;
  label: string;
}

interface InventoryCatalogFiltersProps {
  filters: CatalogFilters;
  resultCount: number;
  totalCount: number;
  categoryOptions: CategoryOption[];
  isRefreshing?: boolean;
  onFiltersChange: (filters: CatalogFilters) => void;
  onRefresh: () => void;
  onClearFilters: () => void;
}

const ITEM_KIND_OPTIONS = [
  { value: '', label: 'Todos los tipos' },
  ...Object.values(InventoryItemKind).map((value) => ({
    value,
    label: getInventoryItemKindLabel(value),
  })),
];

const TRACKING_OPTIONS = [
  { value: '', label: 'Toda la trazabilidad' },
  ...Object.values(InventoryTrackingMode).map((value) => ({
    value,
    label: getInventoryTrackingModeLabel(value),
  })),
];

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  ...Object.values(InventoryItemStatus).map((value) => ({
    value,
    label: getInventoryItemStatusLabel(value),
  })),
];

const PURCHASABLE_OPTIONS = [
  { value: '', label: 'Disponible para compras: todos' },
  { value: 'true', label: 'Solo disponibles para compras' },
  { value: 'false', label: 'No disponibles para compras' },
];

function buildFilterChips(
  filters: CatalogFilters,
  categoryOptions: CategoryOption[],
): Array<{ key: keyof CatalogFilters; label: string }> {
  const chips: Array<{ key: keyof CatalogFilters; label: string }> = [];

  if (filters.search?.trim()) {
    chips.push({ key: 'search', label: `Búsqueda: ${filters.search.trim()}` });
  }
  if (filters.categoryId) {
    const categoryLabel =
      categoryOptions.find((option) => option.value === filters.categoryId)?.label ??
      'Categoría seleccionada';
    chips.push({ key: 'categoryId', label: categoryLabel });
  }
  if (filters.itemKind) {
    chips.push({ key: 'itemKind', label: getInventoryItemKindLabel(filters.itemKind) });
  }
  if (filters.trackingMode) {
    chips.push({ key: 'trackingMode', label: getInventoryTrackingModeLabel(filters.trackingMode) });
  }
  if (filters.status) {
    chips.push({ key: 'status', label: getInventoryItemStatusLabel(filters.status) });
  }
  if (filters.purchasable !== undefined) {
    chips.push({
      key: 'purchasable',
      label: filters.purchasable ? 'Solo disponibles para compras' : 'No disponibles para compras',
    });
  }

  return chips;
}

export function InventoryCatalogFilters({
  filters,
  resultCount,
  totalCount,
  categoryOptions,
  isRefreshing = false,
  onFiltersChange,
  onRefresh,
  onClearFilters,
}: InventoryCatalogFiltersProps) {
  const chips = buildFilterChips(filters, categoryOptions);
  const resultLabel =
    resultCount === totalCount
      ? `${resultCount} productos`
      : `${resultCount} de ${totalCount} productos`;

  function removeChip(key: keyof CatalogFilters) {
    const next = { ...filters };
    delete (next as Record<string, unknown>)[key];
    onFiltersChange(next);
  }

  return (
    <div className="space-y-4 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-border dark:bg-dark-surface-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="portal-eyebrow-muted">Filtros</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{resultLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasActiveCatalogFilters(filters) ? (
            <Button type="button" variant="secondary" size="sm" onClick={onClearFilters}>
              Limpiar filtros
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={isRefreshing}
            className={interactiveFocusClassName}
            onClick={onRefresh}
          >
            Actualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Input
          label="Buscar"
          placeholder="SKU, nombre, marca o modelo"
          value={filters.search ?? ''}
          onChange={(event) => {
            const next = { ...filters };
            const value = event.target.value.trim();
            if (value) {
              next.search = value;
            } else {
              delete next.search;
            }
            onFiltersChange(next);
          }}
        />
        <Select
          label="Categoría"
          value={filters.categoryId ?? ''}
          options={[{ value: '', label: 'Todas las categorías' }, ...categoryOptions]}
          onChange={(event) => {
            const next = { ...filters };
            const value = event.target.value;
            if (value) {
              next.categoryId = value;
            } else {
              delete next.categoryId;
            }
            onFiltersChange(next);
          }}
        />
        <Select
          label="Tipo de producto"
          value={filters.itemKind ?? ''}
          options={ITEM_KIND_OPTIONS}
          onChange={(event) => {
            const next = { ...filters };
            const value = event.target.value as InventoryItemKind;
            if (value) {
              next.itemKind = value;
            } else {
              delete next.itemKind;
            }
            onFiltersChange(next);
          }}
        />
        <Select
          label="Trazabilidad"
          value={filters.trackingMode ?? ''}
          options={TRACKING_OPTIONS}
          onChange={(event) => {
            const next = { ...filters };
            const value = event.target.value as InventoryTrackingMode;
            if (value) {
              next.trackingMode = value;
            } else {
              delete next.trackingMode;
            }
            onFiltersChange(next);
          }}
        />
        <Select
          label="Estado"
          value={filters.status ?? ''}
          options={STATUS_OPTIONS}
          onChange={(event) => {
            const next = { ...filters };
            const value = event.target.value as InventoryItemStatus;
            if (value) {
              next.status = value;
            } else {
              delete next.status;
            }
            onFiltersChange(next);
          }}
        />
        <Select
          label="Disponible para compras"
          value={filters.purchasable === undefined ? '' : String(filters.purchasable)}
          options={PURCHASABLE_OPTIONS}
          onChange={(event) => {
            const next = { ...filters };
            const value = event.target.value;
            if (value === '') {
              delete next.purchasable;
            } else {
              next.purchasable = value === 'true';
            }
            onFiltersChange(next);
          }}
        />
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className={`inline-flex items-center gap-2 rounded-full border border-gray-200 bg-iwana-surface-soft px-3 py-1 text-xs font-medium text-iwana-secondary-700 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-200 ${interactiveFocusClassName}`}
              onClick={() => removeChip(chip.key)}
            >
              {chip.label}
              <span aria-hidden>×</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
