import Link from 'next/link';
import { Button } from '@iwana/ui';
import { PortalAlert } from '@/components/shared/portal-ui';
import {
  type ExpedienteConversionFailure,
  type ExpedienteStatus,
  type ExpedienteSubscriberSummary,
} from '@/lib/api-client';

const CONVERTED_STATUSES: ExpedienteStatus[] = ['INSTALACION_AGENDADA', 'CLIENTE_ACTIVO'];

export function getExpedienteConversionFailureMessage(
  failure: ExpedienteConversionFailure,
): string {
  switch (failure.errorCode) {
    case 'SUBSCRIBER_DATA_AUTHORIZATION_REQUIRED':
      return 'No se creó el suscriptor: falta la autorización de tratamiento de datos. Regístrala en Consentimientos y vuelve a intentarlo.';
    case 'PRIVACY_LEGAL_TEXT_NOT_PUBLISHED':
      return 'No se creó el suscriptor: la empresa no tiene publicado el texto de autorización. Pide a quien administra la privacidad que lo publique.';
    case 'SUBSCRIBER_CONTACT_REQUIRED':
      if (failure.eventName === 'crm.expediente.activated') {
        return 'El suscriptor no se activó: registra al menos un teléfono o un correo.';
      }
      return 'No se pudo completar la conversión. Vuelve a intentarlo; si el problema continúa, contacta a soporte.';
    default:
      return 'No se pudo completar la conversión. Vuelve a intentarlo; si el problema continúa, contacta a soporte.';
  }
}

export function ExpedienteConversionBanner({
  status,
  subscriberSummary,
  conversionFailure = null,
  canRetryConversion = false,
  isRetrying = false,
  retryError = null,
  onRetryConversion,
}: {
  status: ExpedienteStatus;
  subscriberSummary?: ExpedienteSubscriberSummary | null;
  conversionFailure?: ExpedienteConversionFailure | null;
  canRetryConversion?: boolean;
  isRetrying?: boolean;
  retryError?: string | null;
  onRetryConversion?: () => void;
}) {
  if (conversionFailure) {
    const canShowRetry = canRetryConversion && Boolean(onRetryConversion);

    return (
      <PortalAlert
        variant="error"
        title="Hay una conversión pendiente"
        description={
          <>
            <p>{getExpedienteConversionFailureMessage(conversionFailure)}</p>
            {!canShowRetry ? (
              <p className="mt-2">Pide a un administrador que reintente la conversión.</p>
            ) : null}
            {retryError ? (
              <p role="status" className="mt-2">
                {retryError}
              </p>
            ) : null}
          </>
        }
        action={
          canShowRetry ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={isRetrying}
              disabled={isRetrying}
              onClick={onRetryConversion}
            >
              Reintentar conversión
            </Button>
          ) : undefined
        }
      />
    );
  }

  if (!CONVERTED_STATUSES.includes(status)) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-900 dark:border-sky-900/40 dark:bg-sky-900/20 dark:text-sky-200">
      <p className="font-semibold">Esta oportunidad ya fue convertida a suscriptor.</p>
      <p className="mt-1 text-sky-700 dark:text-sky-300">
        La operación posterior se gestiona desde Suscriptores.
      </p>
      {subscriberSummary ? (
        <div className="mt-3">
          <Button asChild size="sm" variant="ghost">
            <Link href={`/dashboard/crm/subscribers/${subscriberSummary.id}`}>
              Ir al suscriptor
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
