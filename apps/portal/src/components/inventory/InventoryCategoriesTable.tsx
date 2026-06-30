'use client';

import type { InventoryCategoryRecord } from '@/lib/api-client';
import { PortalEmptyState } from '@/components/shared/portal-ui';
import { getInventoryCategoryStatusLabel } from './inventory-category-labels';

interface InventoryCategoriesTableProps {
  categories: InventoryCategoryRecord[];
  onRowClick?: (category: InventoryCategoryRecord) => void;
}

export function InventoryCategoriesTable({
  categories,
  onRowClick,
}: InventoryCategoriesTableProps) {
  if (categories.length === 0) {
    return (
      <PortalEmptyState
        title="Sin categorías registradas"
        description="Crea categorías para clasificar los productos del catálogo operativo."
      />
    );
  }

  const rowClassName = onRowClick
    ? 'cursor-pointer transition hover:bg-iwana-primary-50/40 dark:hover:bg-iwana-primary-950/20'
    : '';

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-3">
      <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-border">
        <thead className="bg-gray-50 dark:bg-dark-surface-2">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
              Nombre
            </th>
            <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
              Código
            </th>
            <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
              Descripción
            </th>
            <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
              Estado
            </th>
            <th className="px-4 py-3 text-left font-medium text-iwana-secondary-700 dark:text-gray-200">
              Productos asociados
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
          {categories.map((category) => (
            <tr
              key={category.id}
              className={`align-top ${rowClassName}`}
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
              role={onRowClick ? 'button' : undefined}
            >
              <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                {category.name}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">
                {category.code}
              </td>
              <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                {category.description?.trim() || '—'}
              </td>
              <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                {getInventoryCategoryStatusLabel(category.status)}
              </td>
              <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{category.productCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
