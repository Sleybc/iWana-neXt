'use client';

import { Button, Select, cn } from '@iwana/ui';
import { InventoryItemKind, InventoryItemStatus, InventoryTrackingMode } from '@iwana/shared';
import { interactiveFocusClassName, PortalSearchField } from '@/components/shared/portal-ui';
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
  categoryOptions: CategoryOption[];
  onFiltersChange: (filters: CatalogFilters) => void;
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
  { value: '', label: 'Todo el control de material' },
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
  { value: '', label: 'Todos' },
  { value: 'true', label: 'Disponibles para compras' },
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
      label: filters.purchasable ? 'Disponibles para compras' : 'No disponibles para compras',
    });
  }
  if (filters.commercialReferenceId) {
    chips.push({
      key: 'commercialReferenceId',
      label: 'Referencia comercial vinculada',
    });
  }

  return chips;
}

export function InventoryCatalogFilters({
  filters,
  categoryOptions,
  onFiltersChange,
  onClearFilters,
}: InventoryCatalogFiltersProps) {
  const chips = buildFilterChips(filters, categoryOptions);

  function removeChip(key: keyof CatalogFilters) {
    const next = { ...filters };
    delete (next as Record<string, unknown>)[key];
    onFiltersChange(next);
  }

  return (
    <div className="space-y-3 border-b border-gray-100 pb-4 dark:border-dark-border">
      <PortalSearchField
        id="catalog-product-search"
        label="Buscar producto"
        placeholder="Código, código de barras, nombre, marca o modelo"
        className="w-full"
        value={filters.search ?? ''}
        onChange={(value) => {
          const next = { ...filters };
          if (value.trim()) {
            next.search = value;
          } else {
            delete next.search;
          }
          onFiltersChange(next);
        }}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Select
          label="Categoría"
          className="h-12"
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
          className="h-12"
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
          label="Estado"
          className="h-12"
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
          label="Control de material"
          className="h-12"
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
          label="Disponible para compras"
          className="h-12"
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
        {hasActiveCatalogFilters(filters) ? (
          <Button type="button" variant="secondary" className="h-12 px-4" onClick={onClearFilters}>
            Limpiar filtros
          </Button>
        ) : null}
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              aria-label={`Quitar filtro ${chip.label}`}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border border-gray-200 bg-iwana-surface-soft px-3 py-1 text-xs font-medium text-iwana-secondary-700 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-200',
                interactiveFocusClassName,
              )}
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
