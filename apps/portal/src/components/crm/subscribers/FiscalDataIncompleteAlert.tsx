'use client';

import { Button } from '@iwana/ui';
import type { SubscriberFiscalMissingField } from '@iwana/shared';
import { PortalAlert } from '@/components/shared/portal-ui';
import { FISCAL_DATA_INCOMPLETE_TITLE, FISCAL_MISSING_FIELD_LABELS } from './subscriber-fiscal';

interface FiscalDataIncompleteAlertProps {
  missing: readonly SubscriberFiscalMissingField[];
  onComplete?: (() => void) | undefined;
  className?: string;
  /** `compact`: banner de una línea; la lista de faltantes queda en un detalle plegable. */
  density?: 'default' | 'compact';
}

/** Aviso único de completitud fiscal (D-M05): mismo texto en el detalle, la activación y el contrato. */
export function FiscalDataIncompleteAlert({
  missing,
  onComplete,
  className,
  density = 'default',
}: FiscalDataIncompleteAlertProps) {
  const compact = density === 'compact';
  const missingList = (
    <ul className="mt-1 list-disc space-y-0.5 pl-5">
      {missing.map((field) => (
        <li key={field}>{FISCAL_MISSING_FIELD_LABELS[field]}</li>
      ))}
    </ul>
  );
  return (
    <PortalAlert
      variant="warning"
      title={FISCAL_DATA_INCOMPLETE_TITLE}
      density={density}
      {...(className ? { className } : {})}
      description={
        compact && missing.length > 0 ? (
          <details className="group">
            <summary className="inline-flex min-h-11 cursor-pointer items-center underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary md:min-h-6">
              Ver qué falta ({missing.length})
            </summary>
            <span className="block pb-1">
              Completa estos datos en la pestaña Datos:
              {missingList}
            </span>
          </details>
        ) : missing.length > 0 ? (
          <span className="block">
            Completa estos datos en la pestaña Datos:
            {missingList}
          </span>
        ) : (
          'Completa los datos fiscales del suscriptor en la pestaña Datos.'
        )
      }
      {...(onComplete
        ? {
            action: (
              <Button
                type="button"
                variant="secondary"
                className={compact ? 'min-h-11 md:min-h-8' : undefined}
                onClick={onComplete}
              >
                Completar datos fiscales
              </Button>
            ),
          }
        : {})}
    />
  );
}
