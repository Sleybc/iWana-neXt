'use client';

import type { ReactNode } from 'react';
import { Button } from '@iwana/ui';
import type { InventoryItemRecord } from '@/lib/api-client';
import { PortalSectionHeader, portalDataTableShellClassName } from '@/components/shared/portal-ui';
import { InventoryCatalogFilters } from './InventoryCatalogFilters';
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
  onRefresh?: () => void;
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
  onRefresh,
  onCreateProduct,
  onRowClick,
  onDelete,
  deletingItemId,
  createAction,
}: InventoryCatalogProductsPanelProps) {
  const resultCount = items.length;
  const counterLabel =
    resultCount === totalCount
      ? `${resultCount} productos`
      : `${resultCount} de ${totalCount} productos`;

  const emptyAction = createAction ?? (
    <Button type="button" onClick={onCreateProduct}>
      Nuevo producto
    </Button>
  );

  return (
    <div className={portalDataTableShellClassName}>
      <div className="border-b border-gray-100/80 px-5 py-5 dark:border-dark-border">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <PortalSectionHeader
            className="w-full gap-3"
            eyebrow="Maestro de productos"
            title="Catálogo operativo"
            description="Consulta, filtra y administra productos para compras, stock y ciclo de vida."
            actions={<div className="flex flex-wrap items-center gap-2">{emptyAction}</div>}
          />
        </div>

        <InventoryCatalogFilters
          embedded
          filters={filters}
          resultCount={resultCount}
          totalCount={totalCount}
          categoryOptions={categoryOptions}
          isRefreshing={isRefreshing}
          onFiltersChange={onFiltersChange}
          onClearFilters={onClearFilters}
          {...(onRefresh ? { onRefresh } : {})}
        />
      </div>

      <InventoryItemsTable
        items={items}
        supplierLabels={supplierLabels}
        showCatalogColumns
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        hasActiveFilters={hasActiveCatalogFilters(filters)}
        catalogIsEmpty={totalCount === 0}
        emptyAction={emptyAction}
        onClearFilters={onClearFilters}
        onRowClick={onRowClick}
        onDelete={onDelete}
        deletingItemId={deletingItemId}
      />

      {resultCount > 0 || hasActiveCatalogFilters(filters) ? (
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4 dark:border-dark-border">
          <p className="text-sm text-gray-500 dark:text-gray-400">{counterLabel}</p>
        </div>
      ) : null}
    </div>
  );
}
