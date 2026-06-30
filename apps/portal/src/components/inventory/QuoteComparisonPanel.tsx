'use client';

import type { SupplierQuoteRecord } from '@/lib/api-client';
import { formatInventoryCurrency, formatInventoryDate } from './inventory-labels';

interface QuoteComparisonPanelProps {
  quotes: SupplierQuoteRecord[];
  selectedQuoteId?: string | null;
  onSelectQuote?: (quoteId: string) => void;
}

export function QuoteComparisonPanel({
  quotes,
  selectedQuoteId,
  onSelectQuote,
}: QuoteComparisonPanelProps) {
  if (quotes.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-300">
        Aún no hay cotizaciones registradas.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {quotes.map((quote) => (
        <div
          key={quote.id}
          className={`rounded-2xl border p-4 ${
            selectedQuoteId === quote.id
              ? 'border-iwana-primary bg-iwana-primary/5'
              : 'border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-3'
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">{quote.quoteNumber}</p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                Válida hasta {formatInventoryDate(quote.validUntil)}
              </p>
            </div>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {formatInventoryCurrency(quote.amount)}
            </p>
          </div>
          {onSelectQuote ? (
            <button
              type="button"
              className="mt-3 text-sm font-medium text-iwana-primary hover:underline"
              onClick={() => onSelectQuote(quote.id)}
            >
              Usar esta cotización
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
