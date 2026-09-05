'use client';

import type { SupplierQuoteRecord } from '@/lib/api-client';
import { interactiveFocusClassName } from '@/components/shared/portal-ui';
import { cn, Button } from '@iwana/ui';
import {
  formatInventoryDate,
  formatInventoryMoney,
  getSupplierDisplayLabel,
} from './inventory-labels';
import {
  QUOTE_TAX_NO_INVOICE_COPY,
  getQuoteTaxVisibleLabel,
  inferQuoteTaxEffect,
  resolveQuoteOfferTotal,
  resolveQuotePayableAmount,
  resolveQuoteShippingArrangement,
} from './quote-tax-calc';
import { getQuoteShippingVisibleLabel } from './QuoteShippingFields';
import { QuoteShippingArrangement } from '@iwana/shared';

interface QuoteComparisonPanelProps {
  quotes: SupplierQuoteRecord[];
  supplierLabels?: Record<string, string>;
  selectedQuoteId?: string | null;
  onSelectQuote?: (quoteId: string) => void;
  onEditQuote?: (quoteId: string) => void;
  canEditQuote?: (quoteId: string) => boolean;
}

function toNumeric(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return value;
  }
  return Number.parseFloat(value ?? '0') || 0;
}

export function QuoteComparisonPanel({
  quotes,
  supplierLabels,
  selectedQuoteId,
  onSelectQuote,
  onEditQuote,
  canEditQuote,
}: QuoteComparisonPanelProps) {
  if (quotes.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-300">
        Aún no hay cotizaciones registradas.
      </p>
    );
  }

  const orderedQuotes = [...quotes].sort(
    (a, b) => resolveQuoteOfferTotal(a) - resolveQuoteOfferTotal(b),
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-iwana-secondary-700 dark:text-iwana-secondary-400">
        {QUOTE_TAX_NO_INVOICE_COPY}
      </p>
      {orderedQuotes.map((quote) => {
        const shipping = toNumeric(quote.shippingCost);
        const products = toNumeric(quote.amount);
        const payable = resolveQuotePayableAmount(quote);
        const arrangement = resolveQuoteShippingArrangement(quote);
        const offerTotal = resolveQuoteOfferTotal(quote);
        const supplierName = getSupplierDisplayLabel(quote.partyRefId, supplierLabels);
        const activeTaxes = (quote.taxes ?? []).filter((tax) => tax.applies !== false);
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
                  {formatInventoryMoney(payable)}
                </p>
                <p className="text-xs text-iwana-secondary-700 dark:text-iwana-secondary-400">
                  Neto a pagar
                </p>
              </div>
            </div>
            <dl className="mt-3 grid gap-1 text-xs text-iwana-secondary-700 dark:text-iwana-secondary-400 sm:grid-cols-2">
              <div className="flex justify-between gap-2 sm:block">
                <dt>Base</dt>
                <dd className="font-medium tabular-nums text-gray-900 dark:text-white">
                  {formatInventoryMoney(products)}
                </dd>
              </div>
              {activeTaxes.map((tax) => {
                const effect = tax.effect ?? inferQuoteTaxEffect(tax.code);
                const label = getQuoteTaxVisibleLabel(tax);
                return (
                  <div
                    key={`${quote.id}-${label}-${tax.taxAmount}`}
                    className="flex justify-between gap-2 sm:block"
                  >
                    <dt>{label}</dt>
                    <dd className="font-medium tabular-nums text-gray-900 dark:text-white">
                      {effect === 'ADD'
                        ? formatInventoryMoney(tax.taxAmount)
                        : `− ${formatInventoryMoney(tax.taxAmount)}`}
                    </dd>
                  </div>
                );
              })}
              <div className="flex justify-between gap-2 sm:block">
                <dt>Envío</dt>
                <dd className="font-medium tabular-nums text-gray-900 dark:text-white">
                  {getQuoteShippingVisibleLabel(arrangement, shipping)}
                </dd>
              </div>
              {arrangement === QuoteShippingArrangement.PAY_CARRIER && shipping > 0 ? (
                <div className="flex justify-between gap-2 sm:block">
                  <dt>Total de la oferta</dt>
                  <dd className="font-medium tabular-nums text-gray-900 dark:text-white">
                    {formatInventoryMoney(offerTotal)}
                  </dd>
                </div>
              ) : null}
            </dl>
            {quote.lines && quote.lines.length > 0 ? (
              <ul className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-xs text-iwana-secondary-700 dark:text-iwana-secondary-400 dark:border-dark-border">
                {quote.lines.map((line) => (
                  <li key={line.id} className="flex flex-wrap justify-between gap-2">
                    <span>
                      Cantidad {line.quantity} · Costo unitario{' '}
                      <span className="tabular-nums">{formatInventoryMoney(line.unitCost)}</span>
                    </span>
                    <span className="font-medium tabular-nums text-gray-900 dark:text-white">
                      {formatInventoryMoney(line.lineAmount)}
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
            {onEditQuote && (canEditQuote ? canEditQuote(quote.id) : true) ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="mt-3"
                aria-label={`Modificar cotización de ${supplierName}`}
                onClick={() => onEditQuote(quote.id)}
              >
                Modificar cotización
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
