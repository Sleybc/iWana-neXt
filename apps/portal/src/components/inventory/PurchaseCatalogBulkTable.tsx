'use client';

import { PortalEmptyState, interactiveFocusClassName } from '@/components/shared/portal-ui';

interface PurchaseCatalogBulkTableProps {
  rows: Array<{
    id: string;
    productLabel: string;
    categoryName: string;
    unitLabel: string;
    supplierLabel: string;
    selected: boolean;
  }>;
  isLoading?: boolean;
  onToggle: (itemId: string) => void;
}

export function PurchaseCatalogBulkTable({
  rows,
  isLoading = false,
  onToggle,
}: PurchaseCatalogBulkTableProps) {
  if (isLoading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Buscando en catálogo...</p>;
  }

  if (rows.length === 0) {
    return (
      <PortalEmptyState
        className="w-full"
        title="No hay productos que coincidan"
        description="Ajusta la búsqueda o cambia a otra pestaña de origen."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-2">
      <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-border">
        <thead className="bg-gray-50 dark:bg-dark-surface-3">
          <tr>
            <th className="px-4 py-3 text-left">Sel.</th>
            <th className="px-4 py-3 text-left">Producto</th>
            <th className="px-4 py-3 text-left">Categoría</th>
            <th className="px-4 py-3 text-left">Unidad</th>
            <th className="px-4 py-3 text-left">Proveedor sugerido</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  className={`h-4 w-4 rounded border-gray-300 accent-iwana-primary ${interactiveFocusClassName}`}
                  aria-label={`Seleccionar ${row.productLabel}`}
                  checked={row.selected}
                  onChange={() => onToggle(row.id)}
                />
              </td>
              <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                {row.productLabel}
              </td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{row.categoryName}</td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{row.unitLabel}</td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{row.supplierLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
