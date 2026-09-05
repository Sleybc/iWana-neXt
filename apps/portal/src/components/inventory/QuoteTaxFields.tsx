'use client';

import { Input } from '@iwana/ui';
import type { PurchaseTaxPresetRecord } from '@/lib/api-client';
import {
  QUOTE_TAX_FIELDS,
  QUOTE_TAX_NOT_SUPPLIER_PROFILE_COPY,
  QUOTE_TAX_RATE_ERROR,
  parseQuoteTaxRate,
  resolveQuoteTaxDefaultRate,
  type QuoteTaxCode,
  type QuoteTaxState,
} from './quote-tax-calc';

interface QuoteTaxFieldsProps {
  value: QuoteTaxState;
  onChange: (next: QuoteTaxState) => void;
  presets?: PurchaseTaxPresetRecord[] | undefined;
  disabled?: boolean;
}

export function QuoteTaxFields({
  value,
  onChange,
  presets,
  disabled = false,
}: QuoteTaxFieldsProps) {
  function updateRow(code: QuoteTaxCode, patch: Partial<QuoteTaxState[QuoteTaxCode]>) {
    onChange({
      ...value,
      [code]: {
        ...value[code],
        ...patch,
      },
    });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-gray-200 p-3 dark:border-dark-border">
      <div className="space-y-1">
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          Tributos de esta cotización
        </p>
        <p className="text-xs text-iwana-secondary-700 dark:text-iwana-secondary-400">
          {QUOTE_TAX_NOT_SUPPLIER_PROFILE_COPY}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {QUOTE_TAX_FIELDS.map((field) => {
          const row = value[field.code];
          const rateInvalid = row.applies && parseQuoteTaxRate(row.rate) === null;
          return (
            <div key={field.slug} className="space-y-2">
              <label className="flex min-h-11 items-center gap-2 text-sm text-gray-900 dark:text-white">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-iwana-primary focus:ring-iwana-primary"
                  checked={row.applies}
                  disabled={disabled}
                  onChange={(event) => {
                    const applies = event.target.checked;
                    const nextRate =
                      applies && row.rate.trim() === ''
                        ? String(resolveQuoteTaxDefaultRate(field.code, presets))
                        : row.rate;
                    updateRow(field.code, { applies, rate: nextRate });
                  }}
                />
                <span className="font-medium">{field.label}</span>
              </label>
              {row.applies ? (
                <Input
                  id={`quote-tax-rate-${field.slug}`}
                  label={`Tasa de ${field.label} (%)`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="100"
                  step="0.001"
                  value={row.rate}
                  disabled={disabled}
                  onChange={(event) => updateRow(field.code, { rate: event.target.value })}
                  error={rateInvalid ? QUOTE_TAX_RATE_ERROR : undefined}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
