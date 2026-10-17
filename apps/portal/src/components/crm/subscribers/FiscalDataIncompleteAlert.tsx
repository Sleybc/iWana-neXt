'use client';

import { Button } from '@iwana/ui';
import type { SubscriberFiscalMissingField } from '@iwana/shared';
import { PortalAlert } from '@/components/shared/portal-ui';
import { FISCAL_DATA_INCOMPLETE_TITLE, FISCAL_MISSING_FIELD_LABELS } from './subscriber-fiscal';

interface FiscalDataIncompleteAlertProps {
  missing: readonly SubscriberFiscalMissingField[];
  onComplete?: (() => void) | undefined;
  className?: string;
}

/** Aviso único de completitud fiscal (D-M05): mismo texto en el detalle, la activación y el contrato. */
export function FiscalDataIncompleteAlert({
  missing,
  onComplete,
  className,
}: FiscalDataIncompleteAlertProps) {
  return (
    <PortalAlert
      variant="warning"
      title={FISCAL_DATA_INCOMPLETE_TITLE}
      {...(className ? { className } : {})}
      description={
        missing.length > 0 ? (
          <span className="block">
            Completa estos datos en la pestaña Datos:
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {missing.map((field) => (
                <li key={field}>{FISCAL_MISSING_FIELD_LABELS[field]}</li>
              ))}
            </ul>
          </span>
        ) : (
          'Completa los datos fiscales del suscriptor en la pestaña Datos.'
        )
      }
      {...(onComplete
        ? {
            action: (
              <Button type="button" variant="secondary" onClick={onComplete}>
                Completar datos fiscales
              </Button>
            ),
          }
        : {})}
    />
  );
}
