'use client';

import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';

import { Loader2, Pencil } from 'lucide-react';

import { Badge, Button } from '@iwana/ui';

import type { InventoryCategoryRecord } from '@/lib/api-client';

import {
  PortalActionToolbar,
  PortalEmptyState,
  interactiveFocusClassName,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';

import {
  getInventoryCategoryStatusBadgeVariant,
  getInventoryCategoryStatusLabel,
} from './inventory-category-labels';

interface InventoryCategoriesTableProps {
  categories: InventoryCategoryRecord[];

  isLoading?: boolean;

  isRefreshing?: boolean;

  hasActiveFilters?: boolean;

  catalogIsEmpty?: boolean;

  onRowClick?: (category: InventoryCategoryRecord) => void;

  emptyAction?: ReactNode;

  onClearSearch?: () => void;

  /** Cuando el empty state lo renderiza el panel contenedor. */
  suppressEmptyState?: boolean;
}

const COL_SPAN_BASE = 5;

function resolveColumnCount(hasActions: boolean): number {
  return hasActions ? COL_SPAN_BASE + 1 : COL_SPAN_BASE;
}

function stopRowActivation(event: MouseEvent | KeyboardEvent) {
  event.stopPropagation();
}

export function InventoryCategoriesTable({
  categories,

  isLoading = false,

  isRefreshing = false,

  hasActiveFilters = false,

  catalogIsEmpty = false,

  onRowClick,

  emptyAction,

  onClearSearch,

  suppressEmptyState = false,
}: InventoryCategoriesTableProps) {
  const showLoading = isLoading || isRefreshing;
  const colSpan = resolveColumnCount(Boolean(onRowClick));
  const rowClassName = onRowClick
    ? `cursor-pointer ${portalTableRowHoverClassName} ${interactiveFocusClassName}`
    : '';

  const emptyTitle = catalogIsEmpty
    ? 'Sin categorías registradas'
    : hasActiveFilters
      ? 'Sin resultados'
      : 'Sin categorías registradas';

  const emptyDescription = catalogIsEmpty
    ? 'Crea categorías para clasificar los productos del catálogo.'
    : hasActiveFilters
      ? 'Ajusta la búsqueda para encontrar otra categoría.'
      : 'Crea categorías para clasificar los productos del catálogo.';

  const filteredEmptyAction =
    hasActiveFilters && onClearSearch ? (
      <Button type="button" variant="secondary" onClick={onClearSearch}>
        Limpiar búsqueda
      </Button>
    ) : (
      emptyAction
    );

  return (
    <div className="relative overflow-x-auto" aria-busy={isRefreshing}>
      <table className="w-full min-w-[720px] text-sm">
        <caption className="sr-only">Categorías del catálogo</caption>

        <thead>
          <tr className="border-b border-gray-100 bg-iwana-surface-soft dark:border-dark-border dark:bg-dark-surface-3">
            <th scope="col" className={portalDataTableHeadClassName}>
              Nombre
            </th>

            <th scope="col" className={portalDataTableHeadClassName}>
              Prefijo de código
            </th>

            <th scope="col" className={`${portalDataTableHeadClassName} hidden md:table-cell`}>
              Descripción
            </th>

            <th scope="col" className={portalDataTableHeadClassName}>
              Estado
            </th>

            <th scope="col" className={portalDataTableHeadClassName}>
              Productos asociados
            </th>

            {onRowClick ? (
              <th scope="col" className={`${portalDataTableHeadClassName} text-right`}>
                Acciones
              </th>
            ) : null}
          </tr>
        </thead>

        <tbody>
          {showLoading && categories.length === 0 ? (
            <tr>
              <td
                colSpan={colSpan}
                className="px-4 py-12 text-center text-gray-500 dark:text-gray-400"
              >
                <div
                  className="flex items-center justify-center gap-2"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  Cargando categorías…
                </div>
              </td>
            </tr>
          ) : null}

          {showLoading && categories.length > 0 ? (
            <tr>
              <td
                colSpan={colSpan}
                className="px-4 py-2 text-center text-xs text-gray-500 dark:text-gray-400"
              >
                <div
                  className="flex items-center justify-center gap-2"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Actualizando categorías…
                </div>
              </td>
            </tr>
          ) : null}

          {!showLoading && categories.length === 0 && !suppressEmptyState ? (
            <tr>
              <td colSpan={colSpan} className="px-4 py-12">
                <PortalEmptyState
                  title={emptyTitle}
                  description={emptyDescription}
                  action={catalogIsEmpty || !hasActiveFilters ? emptyAction : filteredEmptyAction}
                  className="w-full"
                />
              </td>
            </tr>
          ) : null}

          {categories.map((category) => (
            <tr
              key={category.id}
              className={`border-b border-gray-50 align-top dark:border-dark-border ${rowClassName}`}
              onClick={onRowClick ? () => onRowClick(category) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();

                        onRowClick(category);
                      }
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
              aria-label={onRowClick ? `Abrir categoría ${category.name}` : undefined}
            >
              <td
                className={`${portalDataTableCellClassName} font-medium text-gray-900 dark:text-white`}
              >
                {category.name}
              </td>

              <td className={`${portalDataTableCellClassName} font-mono text-xs`}>
                {category.codePrefix}
              </td>

              <td className={`${portalDataTableCellClassName} hidden md:table-cell`}>
                {category.description?.trim() || '—'}
              </td>

              <td className={portalDataTableCellClassName}>
                <Badge variant={getInventoryCategoryStatusBadgeVariant(category.status)}>
                  {getInventoryCategoryStatusLabel(category.status)}
                </Badge>
              </td>

              <td className={portalDataTableCellClassName}>{category.productCount}</td>

              {onRowClick ? (
                <td
                  className={portalDataTableCellClassName}
                  onClick={stopRowActivation}
                  onKeyDown={stopRowActivation}
                >
                  <PortalActionToolbar compact align="end" className="ml-auto !inline-flex !w-fit">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Editar categoría ${category.name}`}
                      onClick={() => onRowClick(category)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </PortalActionToolbar>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
