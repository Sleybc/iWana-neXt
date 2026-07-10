'use client';

import type { ReactNode } from 'react';
import { Package } from 'lucide-react';
import { Button } from '@iwana/ui';
import type { InventoryItemRecord } from '@/lib/api-client';
import { PortalEmptyState, portalDataTableShellClassName } from '@/components/shared/portal-ui';
import { InventoryCatalogFilters } from './InventoryCatalogFilters';
import { InventoryCatalogProductsSkeleton } from './InventoryCatalogProductsSkeleton';
import { InventoryItemsTable } from './InventoryItemsTable';
import type { CatalogFilters } from './catalog-filters';
import { hasActiveCatalogFilters } from './catalog-filters';

interface CategoryOption {
  value: string;
  label: string;
}

interface InventoryCatalogProductsPanelProps {
  filters: CatalogFilters;
  items: InventoryItemRecord[];
  totalCount: number;
  categoryOptions: CategoryOption[];
  supplierLabels: Record<string, string>;
  isLoading: boolean;
  isRefreshing?: boolean;
  onFiltersChange: (filters: CatalogFilters) => void;
  onClearFilters: () => void;
  onCreateProduct: () => void;
  onRowClick: (item: InventoryItemRecord) => void;
  onDelete: (item: InventoryItemRecord) => void;
  deletingItemId: string | null;
  createAction?: ReactNode;
}

export function InventoryCatalogProductsPanel({
  filters,
  items,
  totalCount,
  categoryOptions,
  supplierLabels,
  isLoading,
  isRefreshing = false,
  onFiltersChange,
  onClearFilters,
  onCreateProduct,
  onRowClick,
  onDelete,
  deletingItemId,
  createAction,
}: InventoryCatalogProductsPanelProps) {
  const resultCount = items.length;
  const hasFilters = hasActiveCatalogFilters(filters);
  const resultLabel =
    resultCount === totalCount
      ? `${resultCount} productos`
      : `${resultCount} de ${totalCount} productos`;

  const emptyAction = createAction ?? (
    <Button type="button" onClick={onCreateProduct}>
      Nuevo producto
    </Button>
  );

  if (isLoading && totalCount === 0) {
    return <InventoryCatalogProductsSkeleton />;
  }

  if (totalCount === 0 && !hasFilters) {
    return (
      <PortalEmptyState
        title="Sin productos registrados"
        description="Crea productos para empezar a comprar, recibir y mover inventario."
        icon={Package}
        action={emptyAction}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{resultLabel}</p>
      </div>

      <InventoryCatalogFilters
        filters={filters}
        categoryOptions={categoryOptions}
        onFiltersChange={onFiltersChange}
        onClearFilters={onClearFilters}
      />

      {resultCount === 0 ? (
        <PortalEmptyState
          title="Sin resultados con esta búsqueda"
          description="Cambia la búsqueda o limpia los filtros para ver más productos."
          action={
            <Button type="button" variant="secondary" onClick={onClearFilters}>
              Limpiar filtros
            </Button>
          }
        />
      ) : (
        <div className={portalDataTableShellClassName}>
          <div className="overflow-x-auto">
            <InventoryItemsTable
              items={items}
              supplierLabels={supplierLabels}
              showCatalogColumns
              isLoading={isLoading}
              isRefreshing={isRefreshing}
              suppressEmptyState
              onRowClick={onRowClick}
              onDelete={onDelete}
              deletingItemId={deletingItemId}
            />
          </div>
        </div>
      )}
    </div>
  );
}
