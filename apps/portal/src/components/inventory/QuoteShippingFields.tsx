'use client';

import { useId } from 'react';
import { Input, cn } from '@iwana/ui';
import { QuoteShippingArrangement } from '@iwana/shared';
import { interactiveFocusClassName } from '@/components/shared/portal-ui';
import { formatInventoryMoney } from './inventory-labels';

export interface QuoteShippingValue {
  arrangement: QuoteShippingArrangement;
  amount: string;
}

export const INITIAL_QUOTE_SHIPPING: QuoteShippingValue = {
  arrangement: QuoteShippingArrangement.ON_INVOICE,
  amount: '',
};

interface QuoteShippingFieldsProps {
  value: QuoteShippingValue;
  onChange: (next: QuoteShippingValue) => void;
  disabled?: boolean;
}

const ARRANGEMENT_OPTIONS: Array<{
  value: QuoteShippingArrangement;
  label: string;
  hint: string;
}> = [
  {
    value: QuoteShippingArrangement.FREE,
    label: 'Es gratis',
    hint: 'No suma al pago de este proveedor.',
  },
  {
    value: QuoteShippingArrangement.ON_INVOICE,
    label: 'Lo cobra el proveedor',
    hint: 'Va en esta cotización. No entra en las bases de IVA ni retenciones.',
  },
  {
    value: QuoteShippingArrangement.PAY_CARRIER,
    label: 'Lo paga al transportador',
    hint: 'No se le paga a este proveedor. Se muestra aparte para comparar el costo total.',
  },
];

export function parseQuoteShippingAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return 0;
  }
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

export function isQuoteShippingValid(value: QuoteShippingValue): boolean {
  if (value.arrangement === QuoteShippingArrangement.FREE) {
    return true;
  }
  return parseQuoteShippingAmount(value.amount) !== null;
}

export function resolveShippingCost(value: QuoteShippingValue): number {
  if (value.arrangement === QuoteShippingArrangement.FREE) {
    return 0;
  }
  return parseQuoteShippingAmount(value.amount) ?? 0;
}

export function shippingInSupplierPayable(arrangement: QuoteShippingArrangement): boolean {
  return arrangement === QuoteShippingArrangement.ON_INVOICE;
}

export function getQuoteShippingVisibleLabel(
  arrangement: QuoteShippingArrangement,
  shippingCost: number,
): string {
  if (arrangement === QuoteShippingArrangement.FREE) {
    return 'Gratis';
  }
  if (arrangement === QuoteShippingArrangement.PAY_CARRIER) {
    return shippingCost === 0
      ? 'Lo paga al transportador'
      : `${formatInventoryMoney(shippingCost)} al transportador`;
  }
  return shippingCost === 0 ? 'Sin cargo de envío' : formatInventoryMoney(shippingCost);
}

export function QuoteShippingFields({
  value,
  onChange,
  disabled = false,
}: QuoteShippingFieldsProps) {
  const radioGroupName = useId();
  const needsAmount = value.arrangement !== QuoteShippingArrangement.FREE;
  const parsed = parseQuoteShippingAmount(value.amount);
  const amountInvalid = needsAmount && parsed === null;

  return (
    <fieldset className="space-y-3 rounded-2xl border border-gray-200 p-3 dark:border-dark-border">
      <legend className="px-1 text-sm font-medium text-gray-900 dark:text-white">
        Cómo se cubre el envío
      </legend>
      <div className="grid gap-2" role="radiogroup" aria-label="Cómo se cubre el envío">
        {ARRANGEMENT_OPTIONS.map((option) => {
          const checked = value.arrangement === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                'flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-sm',
                checked
                  ? 'border-iwana-primary bg-iwana-primary/5'
                  : 'border-gray-200 bg-iwana-surface-soft/60 dark:border-dark-border dark:bg-dark-surface-3/60',
                disabled ? 'cursor-not-allowed opacity-60' : '',
                interactiveFocusClassName,
              )}
            >
              <input
                type="radio"
                name={radioGroupName}
                className="mt-1 h-4 w-4 border-gray-300 text-iwana-primary focus:ring-iwana-primary"
                checked={checked}
                disabled={disabled}
                onChange={() =>
                  onChange({
                    arrangement: option.value,
                    amount: option.value === QuoteShippingArrangement.FREE ? '' : value.amount,
                  })
                }
              />
              <span>
                <span className="block font-medium text-gray-900 dark:text-white">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-xs text-iwana-secondary-700 dark:text-iwana-secondary-400">
                  {option.hint}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {needsAmount ? (
        <Input
          id="quote-shipping-cost"
          label="Monto del envío"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={value.amount}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, amount: event.target.value })}
          error={amountInvalid ? 'Ingresa un monto de envío válido (cero o mayor).' : undefined}
          helperText="Si aún no hay valor, déjalo en blanco: se toma como cero."
        />
      ) : null}
    </fieldset>
  );
}
