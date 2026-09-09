'use client';

import { memo } from 'react';
import { Badge } from '@iwana/ui';
import {
  interactiveFocusClassName,
  PortalEmptyState,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';

export interface StockIssueSearchResultRow {
  itemId: string;
  productLabel: string;
  /** Disponible en origen como dato; vacío mientras no haya bodega de origen. */
  availabilityLabel: string;
  /** Con origen definido y disponible 0: la fila lo anuncia con badge. */
  noStock: boolean;
}

interface StockIssueSearchResultsProps {
  rows: StockIssueSearchResultRow[];
  isLoading: boolean;
  emptyTitle: string;
  emptyDescription: string;
  onOpenItem: (itemId: string) => void;
}

/**
 * Resultados del buscador del alta (búsqueda primero): cada fila es una
 * acción que abre el panel de captura de línea. Sin selección de casilleros:
 * un producto, una acción; la disponibilidad se muestra como dato.
 */
export const StockIssueSearchResults = memo(function StockIssueSearchResults({
  rows,
  isLoading,
  emptyTitle,
  emptyDescription,
  onOpenItem,
}: StockIssueSearchResultsProps) {
  if (isLoading) {
    return (
      <div className="space-y-2" aria-label="Cargando resultados de la búsqueda" role="status">
        <PortalSkeletonBlock className="h-14 w-full" />
        <PortalSkeletonBlock className="h-14 w-full" />
        <PortalSkeletonBlock className="h-14 w-full" />
      </div>
    );
  }

  if (rows.length === 0) {
    return <PortalEmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.itemId}>
          <button
            type="button"
            className={`flex w-full flex-col items-start gap-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors duration-200 hover:border-iwana-secondary-300 dark:border-dark-border dark:bg-dark-surface-2 dark:hover:border-iwana-secondary-500/40 ${interactiveFocusClassName}`}
            onClick={() => onOpenItem(row.itemId)}
          >
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {row.productLabel}
            </span>
            {row.availabilityLabel && !row.noStock ? (
              <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                {row.availabilityLabel}
              </span>
            ) : null}
            {row.noStock ? <Badge variant="warning">Sin disponible en origen</Badge> : null}
          </button>
        </li>
      ))}
    </ul>
  );
});
