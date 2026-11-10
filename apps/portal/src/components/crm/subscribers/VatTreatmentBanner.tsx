import { isRutResponsibilitiesRequired } from '@iwana/shared';
import type { PersonType, RutResponsibility, VatResponsibility } from '@iwana/shared';
import { formatVatResponsibility, RUT_RESPONSIBILITY_LABELS } from './subscriber-fiscal';

interface VatTreatmentBannerProps {
  personType: PersonType;
  vatResponsibility: VatResponsibility | null;
  rutResponsibilities: readonly RutResponsibility[];
  /** `inline`: resumen de una línea (encabezado de la ficha); `card` por defecto. */
  variant?: 'card' | 'inline';
}

/**
 * Perfil tributario del suscriptor (ADR-093 D6): responsabilidad de IVA y del RUT.
 * El régimen tributario legado y el tratamiento de IVA por suscriptor no se muestran.
 */
export function VatTreatmentBanner({
  personType,
  vatResponsibility,
  rutResponsibilities,
  variant = 'card',
}: VatTreatmentBannerProps) {
  const inline = variant === 'inline';
  const groupClass = inline ? 'flex min-w-0 flex-wrap items-baseline gap-x-1' : 'min-w-0';
  const dtClass = inline
    ? "text-gray-500 after:content-[':'] dark:text-gray-400"
    : 'text-xs font-medium text-gray-500 dark:text-gray-400';
  const ddSpacing = inline ? '' : 'mt-0.5 ';
  return (
    <dl
      className={
        inline
          ? 'flex flex-wrap gap-x-4 gap-y-1 text-sm'
          : 'grid gap-3 rounded-xl bg-iwana-surface-soft px-4 py-3 text-sm dark:bg-dark-surface-3 sm:grid-cols-2'
      }
    >
      <div className={groupClass}>
        <dt className={dtClass}>Responsabilidad de IVA</dt>
        <dd
          className={
            vatResponsibility
              ? `${ddSpacing}font-semibold text-gray-900 dark:text-white`
              : `${ddSpacing}italic text-gray-500 dark:text-gray-400`
          }
        >
          {formatVatResponsibility(vatResponsibility)}
        </dd>
      </div>
      <div className={groupClass}>
        <dt className={dtClass}>Responsabilidades del RUT</dt>
        {rutResponsibilities.length > 0 ? (
          <dd className={`${ddSpacing}text-gray-900 dark:text-white`}>
            {rutResponsibilities.map((code) => RUT_RESPONSIBILITY_LABELS[code]).join(' · ')}
          </dd>
        ) : (
          <dd className={`${ddSpacing}italic text-gray-500 dark:text-gray-400`}>
            {isRutResponsibilitiesRequired({ personType, vatResponsibility })
              ? 'Responsabilidades del RUT pendientes de completar'
              : 'Sin RUT declarado'}
          </dd>
        )}
      </div>
    </dl>
  );
}
