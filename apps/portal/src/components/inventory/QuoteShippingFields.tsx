'use client';

import { useId } from 'react';
import { Input, RadioCardGroup } from '@iwana/ui';
import { QuoteShippingArrangement } from '@iwana/shared';
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
    <div className="space-y-3">
      <RadioCardGroup
        legend="Cómo se cubre el envío"
        name={radioGroupName}
        value={value.arrangement}
        onChange={(nextValue) => {
          const arrangement = nextValue as QuoteShippingArrangement;
          onChange({
            arrangement,
            amount: arrangement === QuoteShippingArrangement.FREE ? '' : value.amount,
          });
        }}
        disabled={disabled}
        options={ARRANGEMENT_OPTIONS.map((option) => ({
          value: option.value,
          title: option.label,
          description: option.hint,
        }))}
      />
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
    </div>
  );
}
