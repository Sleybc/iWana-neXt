'use client';

import type { SupplierQuoteRecord } from '@/lib/api-client';
import { interactiveFocusClassName } from '@/components/shared/portal-ui';
import { cn } from '@iwana/ui';
import {
  formatInventoryCurrency,
  formatInventoryDate,
  getSupplierDisplayLabel,
} from './inventory-labels';

interface QuoteComparisonPanelProps {
  quotes: SupplierQuoteRecord[];
  supplierLabels?: Record<string, string>;
  selectedQuoteId?: string | null;
  onSelectQuote?: (quoteId: string) => void;
}

function toNumeric(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return value;
  }
  return Number.parseFloat(value ?? '0') || 0;
}

function totalWithShipping(quote: SupplierQuoteRecord): number {
  return toNumeric(quote.amount) + toNumeric(quote.shippingCost);
}

export function QuoteComparisonPanel({
  quotes,
  supplierLabels,
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

  const orderedQuotes = [...quotes].sort((a, b) => totalWithShipping(a) - totalWithShipping(b));

  return (
    <div className="space-y-3">
      {orderedQuotes.map((quote) => {
        const shipping = toNumeric(quote.shippingCost);
        const products = toNumeric(quote.amount);
        const total = products + shipping;
        const supplierName = getSupplierDisplayLabel(quote.partyRefId, supplierLabels);
        return (
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
                <p className="font-medium text-gray-900 dark:text-white">{supplierName}</p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  {quote.quoteNumber} · Válida hasta {formatInventoryDate(quote.validUntil)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold tabular-nums text-gray-900 dark:text-white">
                  {formatInventoryCurrency(total)}
                </p>
                <p className="text-xs text-iwana-secondary-700">Total con envío</p>
              </div>
            </div>
            <dl className="mt-3 grid gap-1 text-xs text-iwana-secondary-700 sm:grid-cols-2">
              <div className="flex justify-between gap-2 sm:block">
                <dt>Productos</dt>
                <dd className="font-medium tabular-nums text-gray-900 dark:text-white">
                  {formatInventoryCurrency(products)}
                </dd>
              </div>
              <div className="flex justify-between gap-2 sm:block">
                <dt>Envío</dt>
                <dd className="font-medium tabular-nums text-gray-900 dark:text-white">
                  {shipping === 0 ? 'Gratis' : formatInventoryCurrency(shipping)}
                </dd>
              </div>
            </dl>
            {quote.lines && quote.lines.length > 0 ? (
              <ul className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-xs text-iwana-secondary-700 dark:border-dark-border">
                {quote.lines.map((line) => (
                  <li key={line.id} className="flex flex-wrap justify-between gap-2">
                    <span>
                      Cantidad {line.quantity} · Costo unitario{' '}
                      <span className="tabular-nums">{formatInventoryCurrency(line.unitCost)}</span>
                    </span>
                    <span className="font-medium tabular-nums text-gray-900 dark:text-white">
                      {formatInventoryCurrency(line.lineAmount)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {onSelectQuote ? (
              <button
                type="button"
                className={cn(
                  'mt-3 rounded-lg text-sm font-medium text-iwana-primary hover:underline',
                  interactiveFocusClassName,
                )}
                onClick={() => onSelectQuote(quote.id)}
              >
                Usar esta cotización
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
