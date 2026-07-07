'use client';

import type { ReactNode } from 'react';

import { useMemo, useState } from 'react';

import { Button } from '@iwana/ui';

import type { InventoryCategoryRecord } from '@/lib/api-client';

import {
  PortalSearchField,
  PortalSectionHeader,
  portalDataTableShellClassName,
} from '@/components/shared/portal-ui';

import { InventoryCategoriesTable } from './InventoryCategoriesTable';

interface InventoryCatalogCategoriesPanelProps {
  categories: InventoryCategoryRecord[];

  isLoading: boolean;

  isRefreshing?: boolean;

  onCreateCategory: () => void;

  onRowClick: (category: InventoryCategoryRecord) => void;

  onRefresh?: () => void;

  createAction?: ReactNode;
}

export function InventoryCatalogCategoriesPanel({
  categories,

  isLoading,

  isRefreshing = false,

  onCreateCategory,

  onRowClick,

  onRefresh,

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

  const counterLabel = search.trim()
    ? `${filteredCategories.length} de ${categories.length} categorías`
    : `${categories.length} categorías`;

  return (
    <div className={portalDataTableShellClassName}>
      <div className="border-b border-gray-100/80 px-5 py-5 dark:border-dark-border">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <PortalSectionHeader
            className="w-full gap-3"
            eyebrow="Clasificación del catálogo"
            title="Categorías"
            description="Administra las categorías usadas por los productos operativos."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {onRefresh ? (
                  <Button
                    type="button"
                    variant="secondary"
                    loading={isRefreshing}
                    onClick={onRefresh}
                  >
                    Actualizar
                  </Button>
                ) : null}

                {emptyAction}
              </div>
            }
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_auto] lg:items-end">
          <PortalSearchField
            id="catalog-category-search"
            label="Buscar categoría"
            placeholder="Nombre, código o prefijo"
            value={search}
            onChange={setSearch}
          />

          {search.trim() ? (
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

      <div aria-live="polite" className="sr-only">
        {search.trim() ? counterLabel : null}
      </div>

      <InventoryCategoriesTable
        categories={filteredCategories}
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        hasActiveFilters={Boolean(search.trim())}
        catalogIsEmpty={categories.length === 0}
        emptyAction={emptyAction}
        onClearSearch={() => setSearch('')}
        onRowClick={onRowClick}
      />

      {filteredCategories.length > 0 || search.trim() ? (
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4 dark:border-dark-border">
          <p className="text-sm text-gray-500 dark:text-gray-400">{counterLabel}</p>
        </div>
      ) : null}
    </div>
  );
}
