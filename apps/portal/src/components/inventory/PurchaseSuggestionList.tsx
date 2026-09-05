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
}

export function PurchaseSuggestionList({
  suggestions,
  isLoading = false,
  emptyTitle = 'No hay sugerencias disponibles',
  emptyDescription = 'No vemos productos que necesiten reposición con el material disponible actual.',
  onToggle,
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
      {suggestions.map((suggestion) => (
        <label
          key={suggestion.itemId}
          className="flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 px-4 py-3 dark:border-dark-border"
        >
          <input
            type="checkbox"
            className={`mt-1 h-4 w-4 rounded border-gray-300 accent-iwana-primary ${interactiveFocusClassName}`}
            aria-label={`Seleccionar ${suggestion.productLabel}`}
            checked={suggestion.selected}
            onChange={() => onToggle(suggestion.itemId)}
          />
          <div className="min-w-0">
            <p className="font-medium text-gray-900 dark:text-white">{suggestion.productLabel}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{suggestion.helperLabel}</p>
          </div>
        </label>
      ))}
    </div>
  );
}
