'use client';

import { StockBalanceCondition } from '@iwana/shared';
import { Badge, SkeletonBlock } from '@iwana/ui';
import {
  PortalEmptyState,
  interactiveFocusClassName,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadClassName,
  portalDataTableHeadRowClassName,
  portalDataTableShellClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import {
  STOCK_AVAILABLE_AT_SOURCE_LABEL,
  STOCK_RESERVED_HELP_TEXT,
  formatInventoryQuantity,
  getStockBalanceConditionLabel,
} from './inventory-labels';
import { stockConditionBadgeVariant } from './stock-issue-line-utils';

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
  /**
   * Vía principal (MOD12 S2 §6.2): clic en el nombre del producto abre el panel
   * de captura de línea. El checkbox conserva la vía rápida por lotes y el
   * escaneo de código de barras.
   */
  onOpenItem?: (itemId: string) => void;
}

export function StockIssueCatalogSelector({
  rows,
  isLoading = false,
  showAvailableColumn = false,
  emptyTitle = 'No hay ítems que coincidan',
  emptyDescription = 'Ajusta la búsqueda o cambia a la pestaña Con material.',
  onToggle,
  onOpenItem,
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
    <div className={portalDataTableShellClassName}>
      <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-border">
        <thead className={portalDataTableHeadRowClassName}>
          <tr>
            <th scope="col" className={portalDataTableHeadClassName}>
              Sel.
            </th>
            <th scope="col" className={portalDataTableHeadClassName}>
              Producto
            </th>
            <th scope="col" className={portalDataTableHeadClassName}>
              Categoría
            </th>
            <th scope="col" className={portalDataTableHeadClassName}>
              Unidad
            </th>
            {showAvailableColumn ? (
              <th scope="col" className={portalDataTableHeadClassName}>
                {STOCK_AVAILABLE_AT_SOURCE_LABEL}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className={portalDataTableBodyClassName}>
          {rows.map((row) => (
            <tr key={row.id} className={portalTableRowHoverClassName}>
              <td className={portalDataTableCellClassName}>
                <input
                  type="checkbox"
                  className={`h-4 w-4 rounded border-gray-300 accent-iwana-primary ${interactiveFocusClassName}`}
                  aria-label={`Seleccionar ${row.productLabel}`}
                  checked={row.selected}
                  onChange={() => onToggle(row.id)}
                />
              </td>
              <td className={portalDataTableCellClassName}>
                {onOpenItem ? (
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    className={`block min-h-11 w-full text-left font-medium text-gray-900 hover:text-iwana-primary dark:text-white dark:hover:text-iwana-primary-300 ${interactiveFocusClassName}`}
                    onClick={() => onOpenItem(row.id)}
                  >
                    {row.productLabel}
                  </button>
                ) : (
                  <p className="font-medium text-gray-900 dark:text-white">{row.productLabel}</p>
                )}
                {showAvailableColumn && row.conditions && row.conditions.length > 0 ? (
                  <p className="mt-1 flex flex-wrap gap-1">
                    {row.conditions.map((entry) => (
                      <Badge
                        key={entry.condition}
                        variant={stockConditionBadgeVariant(entry.condition)}
                      >
                        {getStockBalanceConditionLabel(entry.condition)} ·{' '}
                        {formatInventoryQuantity(entry.available)}
                      </Badge>
                    ))}
                  </p>
                ) : null}
              </td>
              <td className={`${portalDataTableCellClassName} text-gray-600 dark:text-gray-300`}>
                {row.categoryName}
              </td>
              <td className={`${portalDataTableCellClassName} text-gray-600 dark:text-gray-300`}>
                {row.unitLabel}
              </td>
              {showAvailableColumn ? (
                <td
                  className={`${portalDataTableCellClassName} tabular-nums text-gray-600 dark:text-gray-300`}
                >
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
