'use client';

import { useId } from 'react';
import { VatTreatment } from '@iwana/shared';
import { Input, Select } from '@iwana/ui';
import {
  CATALOG_VAT_LEGAL_BASIS_SUGGESTIONS,
  CATALOG_VAT_TREATMENT_OPTIONS,
  type CatalogVatFormValue,
} from './catalog-item-vat';

/**
 * Selector de IVA de un ítem del catálogo con su base legal (spec MOD14 2026-11-12 R1).
 * Lo usan productos, servicios y el cargo de instalación del plan: una sola implementación.
 */
export function CatalogVatTreatmentField({
  label,
  helperText,
  value,
  error,
  disabled,
  onChange,
}: {
  label: string;
  helperText: string;
  value: CatalogVatFormValue;
  /** Error de la base legal, ya validado por el formulario. */
  error?: string | undefined;
  disabled?: boolean;
  onChange: (value: CatalogVatFormValue) => void;
}) {
  const id = useId();
  const { treatment, legalBasis } = value;
  return (
    <div className="space-y-2">
      <Select
        label={label}
        helperText={helperText}
        className="h-11"
        value={treatment}
        disabled={disabled}
        onChange={(event) =>
          onChange({ treatment: event.target.value as VatTreatment, legalBasis })
        }
      >
        {CATALOG_VAT_TREATMENT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      {treatment === VatTreatment.STANDARD ? null : (
        <>
          <Input
            label="Base legal"
            helperText="Código del Estatuto Tributario que sustenta el exento o excluido, por ejemplo ET_476_7."
            className="h-11"
            required
            maxLength={40}
            autoComplete="off"
            list={`${id}-legal-basis`}
            value={legalBasis}
            disabled={disabled}
            aria-invalid={error ? 'true' : 'false'}
            {...(error ? { error } : {})}
            onChange={(event) =>
              onChange({ treatment, legalBasis: event.target.value.toUpperCase() })
            }
          />
          <datalist id={`${id}-legal-basis`}>
            {CATALOG_VAT_LEGAL_BASIS_SUGGESTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </datalist>
        </>
      )}
    </div>
  );
}
