'use client';

import type { ReactNode } from 'react';
import { FolderTree } from 'lucide-react';
import { Badge, Button } from '@iwana/ui';
import type { InventoryCategoryRecord } from '@/lib/api-client';
import {
  PortalEmptyState,
  PortalResultsStrip,
  PortalSearchField,
  PortalTablePagination,
  portalDataTableShellClassName,
} from '@/components/shared/portal-ui';
import { InventoryCategoriesTable } from './InventoryCategoriesTable';
import { InventoryCatalogProductsSkeleton } from './InventoryCatalogProductsSkeleton';
import { formatInventoryResultsLabel } from './inventory-list-pagination';

interface InventoryCatalogCategoriesPanelProps {
  categories: InventoryCategoryRecord[];
  /** Total servidor (meta.total). */
  totalCount: number;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  search: string;
  onSearchChange: (search: string) => void;
  isLoading: boolean;
  isRefreshing?: boolean;
  onCreateCategory: () => void;
  onRowClick: (category: InventoryCategoryRecord) => void;
  createAction?: ReactNode;
}

export function InventoryCatalogCategoriesPanel({
  categories,
  totalCount,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  search,
  onSearchChange,
  isLoading,
  isRefreshing = false,
  onCreateCategory,
  onRowClick,
  createAction,
}: InventoryCatalogCategoriesPanelProps) {
  const resultCount = categories.length;
  const hasSearch = Boolean(search.trim());
  const resultsLabel = formatInventoryResultsLabel({
    loaded: resultCount,
    total: totalCount,
    hasMore,
    singular: 'categoría',
    plural: 'categorías',
  });

  const emptyAction = createAction ?? (
    <Button type="button" onClick={onCreateCategory}>
      Nueva categoría
    </Button>
  );

  if (isLoading && totalCount === 0 && resultCount === 0) {
    return <InventoryCatalogProductsSkeleton />;
  }

  if (totalCount === 0 && !hasSearch) {
    return (
      <PortalEmptyState
        title="Sin categorías registradas"
        description="Crea categorías para clasificar los productos del catálogo."
        icon={FolderTree}
        action={emptyAction}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 border-b border-gray-100 pb-4 dark:border-dark-border">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_auto] xl:items-end">
          <PortalSearchField
            id="catalog-category-search"
            label="Buscar categoría"
            placeholder="Nombre, código o prefijo"
            value={search}
            onChange={onSearchChange}
          />
          {hasSearch ? (
            <Button
              type="button"
              variant="secondary"
              className="h-12 px-4"
              onClick={() => onSearchChange('')}
            >
              Limpiar búsqueda
            </Button>
          ) : null}
        </div>
      </div>

      <PortalResultsStrip badge={<Badge variant="neutral">{resultsLabel}</Badge>} />

      {resultCount === 0 ? (
        <PortalEmptyState
          title="Sin resultados con esta búsqueda"
          description="Cambia la búsqueda para encontrar otra categoría."
          action={
            <Button type="button" variant="secondary" onClick={() => onSearchChange('')}>
              Limpiar búsqueda
            </Button>
          }
        />
      ) : (
        <div className={portalDataTableShellClassName}>
          <div className="overflow-x-auto">
            <InventoryCategoriesTable
              categories={categories}
              isLoading={isLoading}
              isRefreshing={isRefreshing}
              suppressEmptyState
              onRowClick={onRowClick}
            />
          </div>
          {onLoadMore ? (
            <PortalTablePagination
              hasMore={hasMore}
              onLoadMore={onLoadMore}
              loading={isLoadingMore}
              resourceLabel="categorías"
              shown={resultCount}
              total={totalCount}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
