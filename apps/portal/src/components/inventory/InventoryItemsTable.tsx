'use client';

import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { Badge, Button } from '@iwana/ui';
import type { InventoryItemRecord } from '@/lib/api-client';
import {
  PortalActionToolbar,
  PortalEmptyState,
  interactiveFocusClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import {
  formatInventoryCurrency,
  formatInventoryQuantity,
  getInventoryItemKindLabel,
  getInventoryItemStatusBadgeVariant,
  getInventoryItemStatusLabel,
  getInventoryTrackingModeLabel,
} from './inventory-labels';

interface InventoryItemsTableProps {
  items: InventoryItemRecord[];
  supplierLabels?: Record<string, string>;
  showCatalogColumns?: boolean;
  isLoading?: boolean;
  isRefreshing?: boolean;
  hasActiveFilters?: boolean;
  catalogIsEmpty?: boolean;
  onRowClick?: (item: InventoryItemRecord) => void;
  onDelete?: (item: InventoryItemRecord) => void;
  deletingItemId?: string | null;
  emptyAction?: ReactNode;
  onClearFilters?: () => void;
}

const tableHeadClass =
  'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400';
const cellClass = 'px-4 py-3 align-middle text-sm text-gray-700 dark:text-gray-200';

function resolveSupplierLabel(
  item: InventoryItemRecord,
  supplierLabels?: Record<string, string>,
): string {
  if (!item.preferredSupplierRefId) {
    return 'Sin proveedor';
  }

  return supplierLabels?.[item.preferredSupplierRefId] ?? 'Proveedor asignado';
}

function resolveReferenceCost(item: InventoryItemRecord): string {
  const standard = Number.parseFloat(item.standardCost || '0');
  if (standard > 0) {
    return formatInventoryCurrency(item.standardCost);
  }

  return formatInventoryCurrency(item.baseCost);
}

function stopRowActivation(event: MouseEvent | KeyboardEvent) {
  event.stopPropagation();
}

function resolveColumnCount(showCatalogColumns: boolean, hasDelete: boolean): number {
  let count = showCatalogColumns ? 10 : 7;
  if (hasDelete) {
    count += 1;
  }
  return count;
}

export function InventoryItemsTable({
  items,
  supplierLabels,
  showCatalogColumns = false,
  isLoading = false,
  isRefreshing = false,
  hasActiveFilters = false,
  catalogIsEmpty = false,
  onRowClick,
  onDelete,
  deletingItemId = null,
  emptyAction,
  onClearFilters,
}: InventoryItemsTableProps) {
  const showLoading = isLoading || isRefreshing;
  const rowInteractive = Boolean(onRowClick);
  const rowClassName = rowInteractive
    ? `cursor-pointer ${portalTableRowHoverClassName} ${interactiveFocusClassName}`
    : '';
  const colSpan = resolveColumnCount(showCatalogColumns, Boolean(onDelete));

  const emptyTitle = catalogIsEmpty
    ? 'Sin productos registrados'
    : hasActiveFilters
      ? 'Sin resultados'
      : 'Sin productos registrados';

  const emptyDescription = catalogIsEmpty
    ? 'Crea referencias maestras para empezar a comprar, recibir y mover inventario.'
    : hasActiveFilters
      ? 'Ajusta los filtros o limpia la búsqueda para ampliar el listado.'
      : 'Crea referencias maestras para empezar a comprar, recibir y mover inventario.';

  const filteredEmptyAction =
    hasActiveFilters && onClearFilters ? (
      <Button type="button" variant="secondary" onClick={onClearFilters}>
        Limpiar filtros
      </Button>
    ) : (
      emptyAction
    );

  return (
    <div className="relative overflow-x-auto" aria-busy={isRefreshing}>
      <table className="w-full min-w-[960px] text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-iwana-surface-soft dark:border-dark-border dark:bg-dark-surface-3">
            <th className={tableHeadClass}>SKU</th>
            <th className={tableHeadClass}>Producto</th>
            {showCatalogColumns ? <th className={tableHeadClass}>Tipo</th> : null}
            <th className={tableHeadClass}>Categoría</th>
            <th className={tableHeadClass}>Trazabilidad</th>
            {showCatalogColumns ? (
              <th className={`${tableHeadClass} hidden lg:table-cell`}>Para compras</th>
            ) : null}
            <th className={tableHeadClass}>Estado</th>
            {showCatalogColumns ? (
              <>
                <th className={`${tableHeadClass} hidden lg:table-cell`}>Proveedor preferido</th>
                <th className={`${tableHeadClass} hidden md:table-cell`}>Costo referencia</th>
                <th className={`${tableHeadClass} hidden md:table-cell`}>Punto de reorden</th>
              </>
            ) : (
              <>
                <th className={tableHeadClass}>Costo base</th>
                <th className={tableHeadClass}>Stock mínimo</th>
              </>
            )}
            {onDelete ? <th className={`${tableHeadClass} text-right`}>Acciones</th> : null}
          </tr>
        </thead>
        <tbody>
          {showLoading && items.length === 0 ? (
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
                  Cargando productos…
                </div>
              </td>
            </tr>
          ) : null}

          {showLoading && items.length > 0 ? (
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
                  Actualizando productos…
                </div>
              </td>
            </tr>
          ) : null}

          {!showLoading && items.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="px-4 py-12 text-center">
                <PortalEmptyState
                  title={emptyTitle}
                  description={emptyDescription}
                  action={catalogIsEmpty || !hasActiveFilters ? emptyAction : filteredEmptyAction}
                  className="mx-auto max-w-xl text-left"
                />
              </td>
            </tr>
          ) : null}

          {items.map((item) => (
            <tr
              key={item.id}
              className={`border-b border-gray-50 align-top dark:border-dark-border ${rowClassName}`}
              onClick={onRowClick ? () => onRowClick(item) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onRowClick(item);
                      }
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
              aria-label={onRowClick ? `Abrir producto ${item.name}` : undefined}
            >
              <td className={`${cellClass} font-mono text-xs`}>{item.sku}</td>
              <td className={cellClass}>
                <p className="font-medium text-gray-900 dark:text-white">{item.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{item.unitOfMeasure}</p>
              </td>
              {showCatalogColumns ? (
                <td className={cellClass}>{getInventoryItemKindLabel(item.itemKind)}</td>
              ) : null}
              <td className={cellClass}>{item.categoryName}</td>
              <td className={cellClass}>{getInventoryTrackingModeLabel(item.trackingMode)}</td>
              {showCatalogColumns ? (
                <td className={`${cellClass} hidden lg:table-cell`}>
                  <Badge variant={item.purchasable ? 'primary' : 'neutral'}>
                    {item.purchasable ? 'Habilitado' : 'No habilitado'}
                  </Badge>
                </td>
              ) : null}
              <td className={cellClass}>
                <Badge variant={getInventoryItemStatusBadgeVariant(item.status)}>
                  {getInventoryItemStatusLabel(item.status)}
                </Badge>
              </td>
              {showCatalogColumns ? (
                <>
                  <td className={`${cellClass} hidden lg:table-cell`}>
                    {resolveSupplierLabel(item, supplierLabels)}
                  </td>
                  <td className={`${cellClass} hidden md:table-cell`}>
                    {resolveReferenceCost(item)}
                  </td>
                  <td className={`${cellClass} hidden md:table-cell`}>
                    {formatInventoryQuantity(item.reorderPoint)}
                  </td>
                </>
              ) : (
                <>
                  <td className={cellClass}>{formatInventoryCurrency(item.baseCost)}</td>
                  <td className={cellClass}>{formatInventoryQuantity(item.minimumStock)}</td>
                </>
              )}
              {onDelete ? (
                <td className={cellClass} onClick={stopRowActivation} onKeyDown={stopRowActivation}>
                  <PortalActionToolbar compact align="end" className="ml-auto !inline-flex !w-fit">
                    {onRowClick ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Editar producto ${item.name}`}
                        onClick={() => onRowClick(item)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Eliminar producto ${item.name}`}
                      loading={deletingItemId === item.id}
                      disabled={deletingItemId === item.id}
                      className="hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                      onClick={() => onDelete(item)}
                    >
                      <Trash2 className="h-4 w-4" />
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
