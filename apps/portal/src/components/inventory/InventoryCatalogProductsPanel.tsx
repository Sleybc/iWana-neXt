'use client';

import type { ReactNode } from 'react';
import { Package } from 'lucide-react';
import { Badge, Button } from '@iwana/ui';
import type { InventoryItemRecord } from '@/lib/api-client';
import {
  PortalEmptyState,
  PortalResultsStrip,
  PortalTablePagination,
  portalDataTableShellClassName,
} from '@/components/shared/portal-ui';
import { InventoryCatalogFilters } from './InventoryCatalogFilters';
import { InventoryCatalogProductsSkeleton } from './InventoryCatalogProductsSkeleton';
import { InventoryItemsTable } from './InventoryItemsTable';
import type { CatalogFilters } from './catalog-filters';
import { hasActiveCatalogFilters } from './catalog-filters';
import { formatInventoryResultsLabel } from './inventory-list-pagination';

interface CategoryOption {
  value: string;
  label: string;
}

interface InventoryCatalogProductsPanelProps {
  filters: CatalogFilters;
  items: InventoryItemRecord[];
  /** Total servidor (meta.total), no el universo materializado. */
  totalCount: number;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
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
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
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
  const resultsLabel = formatInventoryResultsLabel({
    loaded: resultCount,
    total: totalCount,
    hasMore,
    singular: 'producto',
    plural: 'productos',
  });

  const emptyAction = createAction ?? (
    <Button type="button" onClick={onCreateProduct}>
      Nuevo producto
    </Button>
  );

  if (isLoading && totalCount === 0 && resultCount === 0) {
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
      <InventoryCatalogFilters
        filters={filters}
        categoryOptions={categoryOptions}
        onFiltersChange={onFiltersChange}
        onClearFilters={onClearFilters}
      />

      <PortalResultsStrip badge={<Badge variant="neutral">{resultsLabel}</Badge>} />

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
          {onLoadMore ? (
            <PortalTablePagination
              hasMore={hasMore}
              onLoadMore={onLoadMore}
              loading={isLoadingMore}
              resourceLabel="productos"
              shown={resultCount}
              total={totalCount}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
