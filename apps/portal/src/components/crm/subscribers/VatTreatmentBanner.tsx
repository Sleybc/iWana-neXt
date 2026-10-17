import type { RutResponsibility, VatResponsibility } from '@iwana/shared';
import { formatVatResponsibility, RUT_RESPONSIBILITY_LABELS } from './subscriber-fiscal';

interface VatTreatmentBannerProps {
  vatResponsibility: VatResponsibility | null;
  rutResponsibilities: readonly RutResponsibility[];
}

/**
 * Perfil tributario del suscriptor (ADR-093 D6): responsabilidad de IVA y del RUT.
 * El régimen tributario legado y el tratamiento de IVA por suscriptor no se muestran.
 */
export function VatTreatmentBanner({
  vatResponsibility,
  rutResponsibilities,
}: VatTreatmentBannerProps) {
  return (
    <dl className="grid gap-3 rounded-xl bg-iwana-surface-soft px-4 py-3 text-sm dark:bg-dark-surface-3 sm:grid-cols-2">
      <div className="min-w-0">
        <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Responsabilidad de IVA
        </dt>
        <dd
          className={
            vatResponsibility
              ? 'mt-0.5 font-semibold text-gray-900 dark:text-white'
              : 'mt-0.5 italic text-gray-500 dark:text-gray-400'
          }
        >
          {formatVatResponsibility(vatResponsibility)}
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Responsabilidades del RUT
        </dt>
        {rutResponsibilities.length > 0 ? (
          <dd className="mt-0.5 text-gray-900 dark:text-white">
            {rutResponsibilities.map((code) => RUT_RESPONSIBILITY_LABELS[code]).join(' · ')}
          </dd>
        ) : (
          <dd className="mt-0.5 italic text-gray-500 dark:text-gray-400">
            Responsabilidades del RUT pendientes de completar
          </dd>
        )}
      </div>
    </dl>
  );
}
