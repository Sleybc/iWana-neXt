'use client';

import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { Badge, Button } from '@iwana/ui';
import { getInventoryUnitOfMeasureLabel } from '@iwana/shared';
import type { InventoryItemRecord } from '@/lib/api-client';
import {
  PortalActionToolbar,
  PortalEmptyState,
  interactiveFocusClassName,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import {
  formatInventoryCurrency,
  formatInventoryCostOrNone,
  formatInventoryQuantity,
  getInventoryItemKindLabel,
  getInventoryItemStatusBadgeVariant,
  getInventoryItemStatusLabel,
  getInventoryTrackingModeLabel,
  INVENTORY_AVERAGE_COST_LABEL,
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
  /** Cuando el empty state lo renderiza el panel contenedor (p. ej. catálogo al estilo bodegas). */
  suppressEmptyState?: boolean;
}

const tableHeadClass = portalDataTableHeadClassName;
const cellClass = portalDataTableCellClassName;

function resolveSupplierLabel(
  item: InventoryItemRecord,
  supplierLabels?: Record<string, string>,
): string {
  if (!item.preferredSupplierRefId) {
    return 'Sin proveedor';
  }

  return supplierLabels?.[item.preferredSupplierRefId] ?? 'Proveedor asignado';
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
  suppressEmptyState = false,
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
    ? 'Crea productos para empezar a comprar, recibir y mover inventario.'
    : hasActiveFilters
      ? 'Ajusta los filtros o limpia la búsqueda para ampliar el listado.'
      : 'Crea productos para empezar a comprar, recibir y mover inventario.';

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
        <caption className="sr-only">Productos del catálogo</caption>
        <thead>
          <tr className="border-b border-gray-100 bg-iwana-surface-soft dark:border-dark-border dark:bg-dark-surface-3">
            <th scope="col" className={tableHeadClass}>
              Código
            </th>
            <th scope="col" className={tableHeadClass}>
              Producto
            </th>
            {showCatalogColumns ? (
              <th scope="col" className={tableHeadClass}>
                Tipo
              </th>
            ) : null}
            <th scope="col" className={tableHeadClass}>
              Categoría
            </th>
            <th scope="col" className={tableHeadClass}>
              Control de material
            </th>
            {showCatalogColumns ? (
              <th scope="col" className={`${tableHeadClass} hidden lg:table-cell`}>
                Para compras
              </th>
            ) : null}
            <th scope="col" className={tableHeadClass}>
              Estado
            </th>
            {showCatalogColumns ? (
              <>
                <th scope="col" className={`${tableHeadClass} hidden lg:table-cell`}>
                  Proveedor sugerido
                </th>
                <th scope="col" className={`${tableHeadClass} hidden md:table-cell`}>
                  {INVENTORY_AVERAGE_COST_LABEL}
                </th>
                <th scope="col" className={`${tableHeadClass} hidden md:table-cell`}>
                  Nivel de reposición
                </th>
              </>
            ) : (
              <>
                <th scope="col" className={tableHeadClass}>
                  Costo base
                </th>
                <th scope="col" className={tableHeadClass}>
                  Stock mínimo
                </th>
              </>
            )}
            {onDelete ? (
              <th scope="col" className={`${tableHeadClass} text-right`}>
                Acciones
              </th>
            ) : null}
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

          {!showLoading && items.length === 0 && !suppressEmptyState ? (
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
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {getInventoryUnitOfMeasureLabel(item.unitOfMeasure)}
                </p>
              </td>
              {showCatalogColumns ? (
                <td className={cellClass}>{getInventoryItemKindLabel(item.itemKind)}</td>
              ) : null}
              <td className={cellClass}>{item.categoryName}</td>
              <td className={cellClass}>{getInventoryTrackingModeLabel(item.trackingMode)}</td>
              {showCatalogColumns ? (
                <td className={`${cellClass} hidden lg:table-cell`}>
                  <Badge variant={item.purchasable ? 'primary' : 'neutral'}>
                    {item.purchasable ? 'Sí' : 'No'}
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
                  <td className={`${cellClass} hidden md:table-cell tabular-nums`}>
                    {formatInventoryCostOrNone(item.averageCost)}
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
