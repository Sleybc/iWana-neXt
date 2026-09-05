'use client';

import { StockBalanceCondition } from '@iwana/shared';
import { Badge, SkeletonBlock } from '@iwana/ui';
import { PortalEmptyState, interactiveFocusClassName } from '@/components/shared/portal-ui';
import {
  STOCK_AVAILABLE_AT_SOURCE_LABEL,
  STOCK_RESERVED_HELP_TEXT,
  formatInventoryQuantity,
  getStockBalanceConditionLabel,
} from './inventory-labels';

export interface StockIssueCatalogConditionBreakdown {
  condition: StockBalanceCondition;
  /** Disponible formateado en esa condición (nunca el enum crudo). */
  available: string;
}

interface StockIssueCatalogSelectorProps {
  rows: Array<{
    id: string;
    productLabel: string;
    categoryName: string;
    unitLabel: string;
    availableLabel?: string | null;
    /** Desglose por condición con disponible > 0 (D3: REFURBISHED/DAMAGED visibles). */
    conditions?: StockIssueCatalogConditionBreakdown[];
    selected: boolean;
  }>;
  isLoading?: boolean;
  showAvailableColumn?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onToggle: (itemId: string) => void;
}

function badgeVariantForCondition(
  condition: StockBalanceCondition,
): 'success' | 'warning' | 'error' {
  switch (condition) {
    case StockBalanceCondition.NEW:
      return 'success';
    case StockBalanceCondition.REFURBISHED:
      return 'warning';
    case StockBalanceCondition.DAMAGED:
      return 'error';
    default:
      return 'success';
  }
}

export function StockIssueCatalogSelector({
  rows,
  isLoading = false,
  showAvailableColumn = false,
  emptyTitle = 'No hay ítems que coincidan',
  emptyDescription = 'Ajusta la búsqueda o cambia a la pestaña Con material.',
  onToggle,
}: StockIssueCatalogSelectorProps) {
  if (isLoading) {
    return (
      <div className="space-y-2" aria-label="Cargando catálogo" role="status">
        <SkeletonBlock className="h-16 w-full" />
        <SkeletonBlock className="h-16 w-full" />
        <SkeletonBlock className="h-16 w-full" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <PortalEmptyState className="w-full" title={emptyTitle} description={emptyDescription} />
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-2">
      <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-border">
        <thead className="bg-gray-50 dark:bg-dark-surface-3">
          <tr>
            <th scope="col" className="px-4 py-3 text-left">
              Sel.
            </th>
            <th scope="col" className="px-4 py-3 text-left">
              Producto
            </th>
            <th scope="col" className="px-4 py-3 text-left">
              Categoría
            </th>
            <th scope="col" className="px-4 py-3 text-left">
              Unidad
            </th>
            {showAvailableColumn ? (
              <th scope="col" className="px-4 py-3 text-left">
                {STOCK_AVAILABLE_AT_SOURCE_LABEL}
              </th>
            ) : null}
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
              <td className="px-4 py-3">
                <p className="font-medium text-gray-900 dark:text-white">{row.productLabel}</p>
                {showAvailableColumn && row.conditions && row.conditions.length > 0 ? (
                  <p className="mt-1 flex flex-wrap gap-1">
                    {row.conditions.map((entry) => (
                      <Badge
                        key={entry.condition}
                        variant={badgeVariantForCondition(entry.condition)}
                      >
                        {getStockBalanceConditionLabel(entry.condition)} ·{' '}
                        {formatInventoryQuantity(entry.available)}
                      </Badge>
                    ))}
                  </p>
                ) : null}
              </td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{row.categoryName}</td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{row.unitLabel}</td>
              {showAvailableColumn ? (
                <td className="px-4 py-3 tabular-nums text-gray-600 dark:text-gray-300">
                  {row.availableLabel ?? '—'}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>

      {showAvailableColumn ? (
        <p className="px-4 py-3 text-xs text-iwana-secondary-700 dark:text-gray-400">
          {STOCK_RESERVED_HELP_TEXT}
        </p>
      ) : null}
    </div>
  );
}
