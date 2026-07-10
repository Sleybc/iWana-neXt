'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { FolderTree } from 'lucide-react';
import { Button } from '@iwana/ui';
import type { InventoryCategoryRecord } from '@/lib/api-client';
import {
  PortalEmptyState,
  PortalSearchField,
  portalDataTableShellClassName,
} from '@/components/shared/portal-ui';
import { InventoryCategoriesTable } from './InventoryCategoriesTable';
import { InventoryCatalogProductsSkeleton } from './InventoryCatalogProductsSkeleton';

interface InventoryCatalogCategoriesPanelProps {
  categories: InventoryCategoryRecord[];
  isLoading: boolean;
  isRefreshing?: boolean;
  onCreateCategory: () => void;
  onRowClick: (category: InventoryCategoryRecord) => void;
  createAction?: ReactNode;
}

export function InventoryCatalogCategoriesPanel({
  categories,
  isLoading,
  isRefreshing = false,
  onCreateCategory,
  onRowClick,
  createAction,
}: InventoryCatalogCategoriesPanelProps) {
  const [search, setSearch] = useState('');

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return categories;
    }

    return categories.filter((category) => {
      const haystack = [
        category.name,
        category.code,
        category.codePrefix,
        category.description ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [categories, search]);

  const emptyAction = createAction ?? (
    <Button type="button" onClick={onCreateCategory}>
      Nueva categoría
    </Button>
  );

  const hasSearch = Boolean(search.trim());
  const counterLabel = hasSearch
    ? `${filteredCategories.length} de ${categories.length} categorías`
    : `${categories.length} categorías`;

  if (isLoading && categories.length === 0) {
    return <InventoryCatalogProductsSkeleton />;
  }

  if (categories.length === 0) {
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
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{counterLabel}</p>
      </div>

      <div className="space-y-3 border-b border-gray-100 pb-4 dark:border-dark-border">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_auto] xl:items-end">
          <PortalSearchField
            id="catalog-category-search"
            label="Buscar categoría"
            placeholder="Nombre, código o prefijo"
            value={search}
            onChange={setSearch}
          />
          {hasSearch ? (
            <Button
              type="button"
              variant="secondary"
              className="h-12 px-4"
              onClick={() => setSearch('')}
            >
              Limpiar búsqueda
            </Button>
          ) : null}
        </div>
      </div>

      {filteredCategories.length === 0 ? (
        <PortalEmptyState
          title="Sin resultados con esta búsqueda"
          description="Cambia la búsqueda para encontrar otra categoría."
          action={
            <Button type="button" variant="secondary" onClick={() => setSearch('')}>
              Limpiar búsqueda
            </Button>
          }
        />
      ) : (
        <div className={portalDataTableShellClassName}>
          <div className="overflow-x-auto">
            <InventoryCategoriesTable
              categories={filteredCategories}
              isLoading={isLoading}
              isRefreshing={isRefreshing}
              suppressEmptyState
              onRowClick={onRowClick}
            />
          </div>
        </div>
      )}
    </div>
  );
}
