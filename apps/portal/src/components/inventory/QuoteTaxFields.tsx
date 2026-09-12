'use client';

import { useId, useState } from 'react';
import { Button, Input } from '@iwana/ui';
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
  /** Título visible de la sección. Default = copy de cotización (Fase 25). */
  title?: string;
  /** Texto informativo bajo el título. Default = copy de cotización (Fase 25). */
  hint?: string;
  /**
   * Sección colapsable (Fase 29, mostrador). `false` = comportamiento
   * histórico siempre expandido (cotizaciones/RFQ, cero impacto).
   */
  collapsible?: boolean;
  /** Estado inicial cuando es colapsable. Default expandido. */
  defaultExpanded?: boolean;
}

export function QuoteTaxFields({
  value,
  onChange,
  presets,
  disabled = false,
  title = 'Tributos de esta cotización',
  hint = QUOTE_TAX_NOT_SUPPLIER_PROFILE_COPY,
  collapsible = false,
  defaultExpanded = true,
}: QuoteTaxFieldsProps) {
  const contentId = useId();
  const [expanded, setExpanded] = useState(defaultExpanded);
  // Ante tasa inválida se fuerza la expansión: el error no se puede ocultar
  // porque el foco de corrección necesita el input visible.
  const hasInvalidRow = QUOTE_TAX_FIELDS.some(
    (field) => value[field.code].applies && parseQuoteTaxRate(value[field.code].rate) === null,
  );
  const showContent = !collapsible || expanded || hasInvalidRow;

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
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-900 dark:text-white">{title}</p>
          {showContent ? (
            <p className="text-xs text-iwana-secondary-700 dark:text-iwana-secondary-400">{hint}</p>
          ) : null}
        </div>
        {collapsible ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={showContent}
            aria-controls={contentId}
            onClick={() => setExpanded((open) => !open)}
          >
            {showContent ? 'Ocultar' : 'Mostrar'}
          </Button>
        ) : null}
      </div>

      {showContent ? (
        <div id={contentId} className="grid gap-1">
          {QUOTE_TAX_FIELDS.map((field) => {
            const row = value[field.code];
            const rateInvalid = row.applies && parseQuoteTaxRate(row.rate) === null;
            return (
              <div key={field.slug} className="flex items-center gap-2">
                <label className="flex min-h-11 flex-1 items-center gap-2 text-sm text-gray-900 dark:text-white">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 rounded border-gray-300 text-iwana-primary focus:ring-iwana-primary"
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
                    aria-label={`Tasa de ${field.label} (%)`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100"
                    step="0.001"
                    value={row.rate}
                    disabled={disabled}
                    onChange={(event) => updateRow(field.code, { rate: event.target.value })}
                    error={rateInvalid ? QUOTE_TAX_RATE_ERROR : undefined}
                    endAdornment={
                      <span className="text-sm text-gray-500 dark:text-gray-400" aria-hidden="true">
                        %
                      </span>
                    }
                    containerClassName="w-28 shrink-0"
                    className="tabular-nums"
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
