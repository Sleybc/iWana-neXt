'use client';

import { SkeletonBlock } from '@iwana/ui';
import { PortalEmptyState, interactiveFocusClassName } from '@/components/shared/portal-ui';

interface PurchaseSuggestionListProps {
  suggestions: Array<{
    itemId: string;
    productLabel: string;
    helperLabel: string;
    selected: boolean;
  }>;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onToggle: (itemId: string) => void;
  /**
   * Cuando llega, el nombre del producto es el botón que abre el panel de
   * captura de línea (MOD12 S2 §6.2); sin callback el comportamiento es el
   * original (fila completa como label del checkbox).
   */
  onOpenItem?: (itemId: string) => void;
}

export function PurchaseSuggestionList({
  suggestions,
  isLoading = false,
  emptyTitle = 'No hay sugerencias disponibles',
  emptyDescription = 'No vemos productos que necesiten reposición con el material disponible actual.',
  onToggle,
  onOpenItem,
}: PurchaseSuggestionListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2" aria-label="Cargando material disponible" role="status">
        <SkeletonBlock className="h-16 w-full" />
        <SkeletonBlock className="h-16 w-full" />
        <SkeletonBlock className="h-16 w-full" />
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <PortalEmptyState className="w-full" title={emptyTitle} description={emptyDescription} />
    );
  }

  return (
    <div className="space-y-2">
      {suggestions.map((suggestion) => {
        const content = (
          <>
            <input
              type="checkbox"
              className={`mt-1 h-4 w-4 rounded border-gray-300 accent-iwana-primary ${interactiveFocusClassName}`}
              aria-label={`Seleccionar ${suggestion.productLabel}`}
              checked={suggestion.selected}
              onChange={() => onToggle(suggestion.itemId)}
            />
            <div className="min-w-0">
              {onOpenItem ? (
                <button
                  type="button"
                  aria-haspopup="dialog"
                  className={`block min-h-11 w-full text-left font-medium text-gray-900 hover:text-iwana-primary dark:text-white dark:hover:text-iwana-primary-300 ${interactiveFocusClassName}`}
                  onClick={() => onOpenItem(suggestion.itemId)}
                >
                  {suggestion.productLabel}
                </button>
              ) : (
                <p className="font-medium text-gray-900 dark:text-white">
                  {suggestion.productLabel}
                </p>
              )}
              <p className="text-sm text-gray-500 dark:text-gray-400">{suggestion.helperLabel}</p>
            </div>
          </>
        );

        // Con panel: la fila deja de ser label del checkbox para que el clic en
        // el nombre no lo marque; el checkbox sigue operativo por sí solo.
        return onOpenItem ? (
          <div
            key={suggestion.itemId}
            className="flex items-start gap-3 rounded-2xl border border-gray-200 px-4 py-3 dark:border-dark-border"
          >
            {content}
          </div>
        ) : (
          <label
            key={suggestion.itemId}
            className="flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 px-4 py-3 dark:border-dark-border"
          >
            {content}
          </label>
        );
      })}
    </div>
  );
}
