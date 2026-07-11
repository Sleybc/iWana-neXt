'use client';

import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';

import { Loader2, Pencil } from 'lucide-react';

import { Badge, Button } from '@iwana/ui';

import type { SupplierProfileRecord } from '@/lib/api-client';

import {
  PortalActionToolbar,
  PortalEmptyState,
  interactiveFocusClassName,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';

import {
  getSupplierProfileStatusBadgeVariant,
  getSupplierProfileStatusLabel,
} from './inventory-labels';

interface SuppliersTableProps {
  suppliers: SupplierProfileRecord[];
  isLoading?: boolean;
  isRefreshing?: boolean;
  hasActiveFilters?: boolean;
  catalogIsEmpty?: boolean;
  onRowClick?: (supplier: SupplierProfileRecord) => void;
  emptyAction?: ReactNode;
  onClearSearch?: () => void;
  suppressEmptyState?: boolean;
}

const COL_SPAN = 5;

function stopRowActivation(event: MouseEvent | KeyboardEvent) {
  event.stopPropagation();
}

function resolvePurchasingContact(supplier: SupplierProfileRecord): string {
  return (
    supplier.purchasingContactName?.trim() ||
    supplier.purchasingContactEmail?.trim() ||
    supplier.purchasingContactPhone?.trim() ||
    '—'
  );
}

export function SuppliersTable({
  suppliers,
  isLoading = false,
  isRefreshing = false,
  hasActiveFilters = false,
  catalogIsEmpty = false,
  onRowClick,
  emptyAction,
  onClearSearch,
  suppressEmptyState = false,
}: SuppliersTableProps) {
  const showLoading = isLoading || isRefreshing;
  const rowClassName = onRowClick
    ? `cursor-pointer ${portalTableRowHoverClassName} ${interactiveFocusClassName}`
    : '';

  const emptyTitle = catalogIsEmpty
    ? 'Sin proveedores registrados'
    : hasActiveFilters
      ? 'Sin resultados'
      : 'Sin proveedores registrados';

  const emptyDescription = catalogIsEmpty
    ? 'Registra proveedores para vincularlos a compras y cotizaciones.'
    : hasActiveFilters
      ? 'Ajusta la búsqueda para encontrar otro proveedor.'
      : 'Registra proveedores para vincularlos a compras y cotizaciones.';

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
        <caption className="sr-only">Proveedores registrados</caption>

        <thead>
          <tr className="border-b border-gray-100 bg-iwana-surface-soft dark:border-dark-border dark:bg-dark-surface-3">
            <th scope="col" className={portalDataTableHeadClassName}>
              Nombre
            </th>
            <th scope="col" className={portalDataTableHeadClassName}>
              Código
            </th>
            <th scope="col" className={`${portalDataTableHeadClassName} hidden md:table-cell`}>
              Contacto compras
            </th>
            <th scope="col" className={portalDataTableHeadClassName}>
              Estado
            </th>
            <th scope="col" className={`${portalDataTableHeadClassName} text-right`}>
              Acciones
            </th>
          </tr>
        </thead>

        <tbody>
          {showLoading && suppliers.length === 0 ? (
            <tr>
              <td
                colSpan={COL_SPAN}
                className="px-4 py-12 text-center text-gray-500 dark:text-gray-400"
              >
                <div
                  className="flex items-center justify-center gap-2"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  Cargando proveedores…
                </div>
              </td>
            </tr>
          ) : null}

          {showLoading && suppliers.length > 0 ? (
            <tr>
              <td
                colSpan={COL_SPAN}
                className="px-4 py-2 text-center text-xs text-gray-500 dark:text-gray-400"
              >
                <div
                  className="flex items-center justify-center gap-2"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Actualizando proveedores…
                </div>
              </td>
            </tr>
          ) : null}

          {!showLoading && suppliers.length === 0 && !suppressEmptyState ? (
            <tr>
              <td colSpan={COL_SPAN} className="px-4 py-12">
                <PortalEmptyState
                  title={emptyTitle}
                  description={emptyDescription}
                  action={catalogIsEmpty || !hasActiveFilters ? emptyAction : filteredEmptyAction}
                  className="w-full"
                />
              </td>
            </tr>
          ) : null}

          {suppliers.map((supplier) => {
            const displayName = supplier.party?.displayName ?? 'Sin nombre';

            return (
              <tr
                key={supplier.id}
                className={`border-b border-gray-50 align-top dark:border-dark-border ${rowClassName}`}
                onClick={onRowClick ? () => onRowClick(supplier) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onRowClick(supplier);
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                aria-label={onRowClick ? `Abrir proveedor ${displayName}` : undefined}
              >
                <td
                  className={`${portalDataTableCellClassName} font-medium text-gray-900 dark:text-white`}
                >
                  {displayName}
                </td>

                <td className={`${portalDataTableCellClassName} font-mono text-xs`}>
                  {supplier.supplierCode}
                </td>

                <td className={`${portalDataTableCellClassName} hidden md:table-cell`}>
                  {resolvePurchasingContact(supplier)}
                </td>

                <td className={portalDataTableCellClassName}>
                  <Badge variant={getSupplierProfileStatusBadgeVariant(supplier.status)}>
                    {getSupplierProfileStatusLabel(supplier.status)}
                  </Badge>
                </td>

                <td
                  className={portalDataTableCellClassName}
                  onClick={stopRowActivation}
                  onKeyDown={stopRowActivation}
                >
                  {onRowClick ? (
                    <PortalActionToolbar
                      compact
                      align="end"
                      className="ml-auto !inline-flex !w-fit"
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Editar proveedor ${displayName}`}
                        onClick={() => onRowClick(supplier)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </PortalActionToolbar>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
