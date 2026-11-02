'use client';

import { useCallback, useEffect, useState } from 'react';
import { isRutResponsibilitiesRequired, PersonType } from '@iwana/shared';
import type { RutResponsibility, UpdateSubscriberPayload, VatResponsibility } from '@iwana/shared';
import type { SubscriberRecord } from '@/lib/api-client';
import { filterRutResponsibilities } from './subscriber-fiscal';
import { SectionCard } from './SubscriberSections';
import { SubscriberFiscalFields } from './SubscriberFiscalFields';

interface SubscriberFiscalSectionProps {
  subscriber: SubscriberRecord;
  onSave: (partial: Partial<UpdateSubscriberPayload>) => Promise<void>;
  /** Avisa al contenedor si hay cambios sin guardar (p. ej. para marcar la pestaña). */
  onDirtyChange?: (dirty: boolean) => void;
}

const RUT_REQUIRED_MESSAGE = 'Selecciona al menos una responsabilidad del RUT.';

/**
 * Clasificación fiscal del suscriptor (ADR-093 D6). Vive en la pestaña Tributario, junto al
 * perfil tributario: las dos responden cómo se le factura (spec ficha 360°, 2026-09-04).
 */
export function SubscriberFiscalSection({
  subscriber,
  onSave,
  onDirtyChange,
}: SubscriberFiscalSectionProps) {
  const [fiscal, setFiscal] = useState<{
    vatResponsibility: VatResponsibility | '';
    rutResponsibilities: RutResponsibility[];
  }>({
    vatResponsibility: subscriber.vatResponsibility ?? '',
    rutResponsibilities: filterRutResponsibilities(subscriber.rutResponsibilities),
  });
  const [fiscalErrors, setFiscalErrors] = useState<{
    vat?: string | undefined;
    rut?: string | undefined;
  }>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetToSaved = useCallback(() => {
    setFiscal({
      vatResponsibility: subscriber.vatResponsibility ?? '',
      rutResponsibilities: filterRutResponsibilities(subscriber.rutResponsibilities),
    });
    setFiscalErrors({});
    setError(null);
  }, [subscriber]);

  // Re-sincronizar cuando el suscriptor se recarga desde el servidor
  useEffect(() => {
    resetToSaved();
  }, [resetToSaved]);

  const savedRut = filterRutResponsibilities(subscriber.rutResponsibilities);
  const dirty =
    fiscal.vatResponsibility !== (subscriber.vatResponsibility ?? '') ||
    fiscal.rutResponsibilities.length !== savedRut.length ||
    fiscal.rutResponsibilities.some((code) => !savedRut.includes(code));

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // Recargar o cerrar la página con cambios sin guardar pide confirmación al navegador.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const personType = subscriber.personType ?? PersonType.NATURAL;
  const rutResponsibilitiesRequired = isRutResponsibilitiesRequired({
    personType,
    vatResponsibility: fiscal.vatResponsibility || undefined,
  });

  // Con datos guardados incompletos, guardar sigue disponible para mostrar qué falta.
  const savedIncomplete =
    !subscriber.vatResponsibility ||
    (isRutResponsibilitiesRequired({
      personType,
      vatResponsibility: subscriber.vatResponsibility,
    }) &&
      savedRut.length === 0);

  const save = async () => {
    setError(null);
    const nextErrors: { vat?: string | undefined; rut?: string | undefined } = {};
    if (!fiscal.vatResponsibility) nextErrors.vat = 'Selecciona la responsabilidad de IVA.';
    if (rutResponsibilitiesRequired && fiscal.rutResponsibilities.length === 0) {
      nextErrors.rut = RUT_REQUIRED_MESSAGE;
    }
    setFiscalErrors(nextErrors);
    if (nextErrors.vat || nextErrors.rut || !fiscal.vatResponsibility) return;

    setSaving(true);
    try {
      await onSave({
        vatResponsibility: fiscal.vatResponsibility,
        rutResponsibilities: fiscal.rutResponsibilities,
      });
    } catch {
      setError('No fue posible guardar los datos fiscales.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="Datos fiscales"
      description="Necesarios para crear contratos y facturar a este suscriptor."
      saving={saving}
      onSave={() => void save()}
      error={error}
      dirty={dirty || savedIncomplete}
      {...(dirty ? { onDiscard: resetToSaved } : {})}
    >
      <SubscriberFiscalFields
        rutResponsibilitiesRequired={rutResponsibilitiesRequired}
        vatResponsibility={fiscal.vatResponsibility}
        rutResponsibilities={fiscal.rutResponsibilities}
        onVatResponsibilityChange={(value) => {
          setFiscal((prev) => ({ ...prev, vatResponsibility: value }));
          setFiscalErrors((prev) => ({
            ...prev,
            vat: undefined,
            rut:
              isRutResponsibilitiesRequired({ personType, vatResponsibility: value }) &&
              fiscal.rutResponsibilities.length === 0
                ? RUT_REQUIRED_MESSAGE
                : undefined,
          }));
        }}
        onRutResponsibilitiesChange={(value) => {
          setFiscal((prev) => ({ ...prev, rutResponsibilities: value }));
          setFiscalErrors((prev) => ({ ...prev, rut: undefined }));
        }}
        vatError={fiscalErrors.vat}
        rutError={fiscalErrors.rut}
        layout="stacked"
      />
    </SectionCard>
  );
}
