'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, CheckboxCard, RadioCardGroup } from '@iwana/ui';
import type { RutResponsibility, VatResponsibility } from '@iwana/shared';
import { RUT_RESPONSIBILITY_OPTIONS, VAT_RESPONSIBILITY_OPTIONS } from './subscriber-fiscal';

interface SubscriberFiscalFieldsProps {
  rutResponsibilitiesRequired: boolean;
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
  rutResponsibilitiesRequired,
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
  const rutListId = `${idPrefix}-rut-list`;
  const [rutExpanded, setRutExpanded] = useState(false);
  // Persona natural no responsable: las casillas son opcionales y casi nunca se usan,
  // así que quedan plegadas salvo que haya alguna marcada o un error que mostrar.
  const showRutList =
    rutResponsibilitiesRequired ||
    rutExpanded ||
    rutResponsibilities.length > 0 ||
    Boolean(rutError);

  // Si el grupo aparece por una acción del usuario (marcar «Responsable» o desplegarlo), el foco
  // pasa a la primera casilla; al cargar datos guardados no se mueve el foco.
  const rutListRef = useRef<HTMLDivElement>(null);
  const focusRutOnShow = useRef(false);
  const rutWasVisible = useRef(showRutList);
  useEffect(() => {
    if (showRutList && !rutWasVisible.current && focusRutOnShow.current) {
      rutListRef.current?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus();
    }
    focusRutOnShow.current = false;
    rutWasVisible.current = showRutList;
  }, [showRutList]);
  // Si el cambio de IVA no desplegó el grupo, la intención de foco no se arrastra a otro render.
  useEffect(() => {
    focusRutOnShow.current = false;
  }, [vatResponsibility]);

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
          onChange={(value) => {
            focusRutOnShow.current = true;
            onVatResponsibilityChange(value as VatResponsibility);
          }}
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
          Responsabilidades del RUT{rutResponsibilitiesRequired ? '' : ' (opcional)'}
        </legend>
        <p id={rutHintId} className="text-xs text-gray-500 dark:text-gray-400">
          {rutResponsibilitiesRequired
            ? 'Marca todas las que figuran en el RUT.'
            : 'Opcional si la persona no tiene RUT. Al facturar se informa como "No aplica, otros".'}
        </p>
        {showRutList ? (
          <div id={rutListId} ref={rutListRef} className="grid gap-2">
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
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 gap-1.5"
            aria-expanded={false}
            onClick={() => {
              focusRutOnShow.current = true;
              setRutExpanded(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Agregar responsabilidades del RUT
          </Button>
        )}
        {rutError && (
          <p id={rutErrorId} role="alert" className="text-xs text-rose-600">
            {rutError}
          </p>
        )}
      </fieldset>
    </div>
  );
}
