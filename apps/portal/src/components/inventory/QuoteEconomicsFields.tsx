'use client';

import type { ReactNode } from 'react';
import { Input } from '@iwana/ui';
import type { PurchaseTaxPresetRecord } from '@/lib/api-client';
import { QuoteShippingArrangement } from '@iwana/shared';
import { formatInventoryMoney } from './inventory-labels';
import {
  QUOTE_TAX_NO_INVOICE_COPY,
  computeQuoteTaxPreview,
  type QuoteTaxState,
} from './quote-tax-calc';
import {
  QuoteShippingFields,
  getQuoteShippingVisibleLabel,
  resolveShippingCost,
  shippingInSupplierPayable,
  type QuoteShippingValue,
} from './QuoteShippingFields';
import { QuoteTaxFields } from './QuoteTaxFields';

interface QuoteEconomicsFieldsProps {
  shipping: QuoteShippingValue;
  onShippingChange: (next: QuoteShippingValue) => void;
  taxes: QuoteTaxState;
  onTaxesChange: (next: QuoteTaxState) => void;
  amount: number;
  presets?: PurchaseTaxPresetRecord[] | undefined;
  disabled?: boolean;
  quoteNumber?: string;
  onQuoteNumberChange?: (value: string) => void;
  quoteNumberId?: string;
  quoteNumberError?: string | undefined;
  saveHint?: string | null;
  footer?: ReactNode;
}

export function QuoteEconomicsFields({
  shipping,
  onShippingChange,
  taxes,
  onTaxesChange,
  amount,
  presets,
  disabled = false,
  quoteNumber,
  onQuoteNumberChange,
  quoteNumberId,
  quoteNumberError,
  saveHint,
  footer,
}: QuoteEconomicsFieldsProps) {
  const shippingCost = resolveShippingCost(shipping);
  const shippingInPayable = shippingInSupplierPayable(shipping.arrangement);
  const preview = computeQuoteTaxPreview({
    amount,
    shippingCost: shippingInPayable ? shippingCost : 0,
    taxes,
  });
  const netoReady = preview.valid && preview.payable !== null;
  const carrierFreight =
    shipping.arrangement === QuoteShippingArrangement.PAY_CARRIER ? shippingCost : 0;
  const offerTotal =
    netoReady && preview.payable !== null ? preview.payable + carrierFreight : null;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(15rem,0.8fr)] lg:items-start">
      <div className="space-y-3">
        <QuoteShippingFields value={shipping} onChange={onShippingChange} disabled={disabled} />
        <QuoteTaxFields
          value={taxes}
          onChange={onTaxesChange}
          presets={presets}
          disabled={disabled}
        />
      </div>
      <aside className="space-y-3 rounded-2xl border border-gray-200 p-3 dark:border-dark-border lg:sticky lg:top-2">
        {onQuoteNumberChange ? (
          <Input
            id={quoteNumberId ?? 'quote-number'}
            label="Número de cotización"
            value={quoteNumber ?? ''}
            disabled={disabled}
            requiredIndicator
            onChange={(event) => onQuoteNumberChange(event.target.value)}
            error={quoteNumberError}
            helperText="El que trae la oferta del proveedor."
          />
        ) : null}
        <p className="text-sm font-medium text-gray-900 dark:text-white">Resumen de esta oferta</p>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-iwana-secondary-700 dark:text-iwana-secondary-400">Base</dt>
            <dd className="font-medium tabular-nums text-gray-900 dark:text-white">
              {formatInventoryMoney(amount)}
            </dd>
          </div>
          {preview.lines.map((line) => (
            <div key={line.label} className="flex justify-between gap-2">
              <dt className="text-iwana-secondary-700 dark:text-iwana-secondary-400">
                {line.label}
              </dt>
              <dd className="font-medium tabular-nums text-gray-900 dark:text-white">
                {line.effect === 'ADD'
                  ? formatInventoryMoney(line.taxAmount)
                  : `− ${formatInventoryMoney(line.taxAmount)}`}
              </dd>
            </div>
          ))}
          <div className="flex justify-between gap-2">
            <dt className="text-iwana-secondary-700 dark:text-iwana-secondary-400">Envío</dt>
            <dd className="text-right font-medium tabular-nums text-gray-900 dark:text-white">
              {getQuoteShippingVisibleLabel(shipping.arrangement, shippingCost)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2 border-t border-gray-100 pt-2 dark:border-dark-border">
            <dt className="font-medium text-gray-900 dark:text-white">Neto a pagar</dt>
            <dd className="text-lg font-semibold tabular-nums text-gray-900 dark:text-white">
              {netoReady && preview.payable !== null ? formatInventoryMoney(preview.payable) : '—'}
            </dd>
          </div>
          {carrierFreight > 0 ? (
            <div className="flex justify-between gap-2">
              <dt className="text-iwana-secondary-700 dark:text-iwana-secondary-400">
                Total de la oferta
              </dt>
              <dd className="font-medium tabular-nums text-gray-900 dark:text-white">
                {offerTotal !== null ? formatInventoryMoney(offerTotal) : '—'}
              </dd>
            </div>
          ) : null}
        </dl>
        <p className="mt-3 text-xs text-iwana-secondary-700 dark:text-iwana-secondary-400">
          {QUOTE_TAX_NO_INVOICE_COPY}
        </p>
        {shipping.arrangement === QuoteShippingArrangement.PAY_CARRIER ? (
          <p className="mt-1 text-xs text-iwana-secondary-700 dark:text-iwana-secondary-400">
            Neto a pagar es lo que se le cancela a este proveedor.
          </p>
        ) : null}
        {saveHint ? (
          <p
            className="text-sm text-iwana-secondary-700 dark:text-iwana-secondary-400"
            role="status"
          >
            {saveHint}
          </p>
        ) : null}
        {footer ? <div className="flex flex-wrap gap-2">{footer}</div> : null}
      </aside>
    </div>
  );
}
