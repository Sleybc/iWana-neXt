'use client';

import { useId } from 'react';
import { CheckboxCard, RadioCardGroup } from '@iwana/ui';
import type { RutResponsibility, VatResponsibility } from '@iwana/shared';
import { RUT_RESPONSIBILITY_OPTIONS, VAT_RESPONSIBILITY_OPTIONS } from './subscriber-fiscal';

interface SubscriberFiscalFieldsProps {
  vatResponsibility: VatResponsibility | '';
  rutResponsibilities: RutResponsibility[];
  onVatResponsibilityChange: (value: VatResponsibility) => void;
  onRutResponsibilitiesChange: (value: RutResponsibility[]) => void;
  vatError?: string | undefined;
  rutError?: string | undefined;
  /** `stacked` para columnas angostas, como las secciones del detalle. */
  layout?: 'split' | 'stacked';
}

/** Responsabilidad de IVA y responsabilidades del RUT (ADR-093 D6), controlados. */
export function SubscriberFiscalFields({
  vatResponsibility,
  rutResponsibilities,
  onVatResponsibilityChange,
  onRutResponsibilitiesChange,
  vatError,
  rutError,
  layout = 'split',
}: SubscriberFiscalFieldsProps) {
  const idPrefix = useId();
  const vatErrorId = `${idPrefix}-vat-error`;
  const rutErrorId = `${idPrefix}-rut-error`;
  const rutHintId = `${idPrefix}-rut-hint`;

  const toggleRut = (code: RutResponsibility, checked: boolean) => {
    const next = checked
      ? [...rutResponsibilities.filter((current) => current !== code), code]
      : rutResponsibilities.filter((current) => current !== code);
    onRutResponsibilitiesChange(
      RUT_RESPONSIBILITY_OPTIONS.map((option) => option.code).filter((value) =>
        next.includes(value),
      ),
    );
  };

  return (
    <div className={layout === 'split' ? 'grid gap-4 md:grid-cols-2' : 'grid gap-4'}>
      <div className="min-w-0">
        <RadioCardGroup
          legend="Responsabilidad de IVA"
          name={`${idPrefix}-vat-responsibility`}
          value={vatResponsibility || null}
          onChange={(value) => onVatResponsibilityChange(value as VatResponsibility)}
          options={VAT_RESPONSIBILITY_OPTIONS}
          density="compact"
        />
        {vatError && (
          <p id={vatErrorId} role="alert" className="mt-1 text-xs text-rose-600">
            {vatError}
          </p>
        )}
      </div>

      <fieldset
        className="min-w-0 space-y-2"
        aria-describedby={rutError ? `${rutHintId} ${rutErrorId}` : rutHintId}
      >
        <legend className="text-sm font-medium text-gray-700 dark:text-gray-200">
          Responsabilidades del RUT
        </legend>
        <p id={rutHintId} className="text-xs text-gray-500 dark:text-gray-400">
          Marca todas las que figuran en el RUT.
        </p>
        <div className="grid gap-2">
          {RUT_RESPONSIBILITY_OPTIONS.map((option) => (
            <CheckboxCard
              key={option.code}
              className="min-h-11"
              label={option.label}
              description={<span className="font-mono">{option.code}</span>}
              checked={rutResponsibilities.includes(option.code)}
              onChange={(event) => toggleRut(option.code, event.target.checked)}
            />
          ))}
        </div>
        {rutError && (
          <p id={rutErrorId} role="alert" className="text-xs text-rose-600">
            {rutError}
          </p>
        )}
      </fieldset>
    </div>
  );
}
