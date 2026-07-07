'use client';

interface PurchaseSuggestionListProps {
  suggestions: Array<{
    itemId: string;
    productLabel: string;
    helperLabel: string;
    selected: boolean;
  }>;
  isLoading?: boolean;
  onToggle: (itemId: string) => void;
}

export function PurchaseSuggestionList({
  suggestions,
  isLoading = false,
  onToggle,
}: PurchaseSuggestionListProps) {
  if (isLoading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Cargando sugerencias...</p>;
  }

  if (suggestions.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-sm text-gray-500 dark:border-dark-border dark:text-gray-400">
        No hay sugerencias disponibles con las senales actuales de stock.
      </p>
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
            className="mt-1 h-4 w-4 rounded border-gray-300 accent-iwana-primary"
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
