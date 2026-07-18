'use client';

import { Input } from '@iwana/ui';

export interface QuoteShippingValue {
  isFree: boolean;
  amount: string;
}

interface QuoteShippingFieldsProps {
  value: QuoteShippingValue;
  onChange: (next: QuoteShippingValue) => void;
  disabled?: boolean;
}

export function resolveShippingCost(value: QuoteShippingValue): number | null {
  if (value.isFree) {
    return 0;
  }
  const trimmed = value.amount.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

export function QuoteShippingFields({
  value,
  onChange,
  disabled = false,
}: QuoteShippingFieldsProps) {
  const amountTouched = value.amount.trim().length > 0;
  const parsed = Number.parseFloat(value.amount);
  const amountInvalid = !value.isFree && amountTouched && (!Number.isFinite(parsed) || parsed < 0);

  return (
    <div className="space-y-3 rounded-2xl border border-gray-200 p-3 dark:border-dark-border">
      <label className="flex items-center gap-2 text-sm text-gray-900 dark:text-white">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-iwana-primary focus:ring-iwana-primary"
          checked={value.isFree}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              isFree: event.target.checked,
              amount: event.target.checked ? '' : value.amount,
            })
          }
        />
        <span className="font-medium">Envío gratis</span>
      </label>
      <Input
        id="quote-shipping-cost"
        label="Gastos de envío"
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={value.isFree ? '0' : value.amount}
        disabled={disabled || value.isFree}
        onChange={(event) => onChange({ ...value, amount: event.target.value })}
        error={amountInvalid ? 'Ingresa un monto de envío válido (cero o mayor).' : undefined}
        helperText={
          value.isFree
            ? 'El envío se registrará como gratis.'
            : 'Deja en blanco hasta completar; el total con envío suma productos + flete.'
        }
      />
    </div>
  );
}
