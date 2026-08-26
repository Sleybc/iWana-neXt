import Link from 'next/link';
import { Button } from '@iwana/ui';
import { type ExpedienteStatus, type ExpedienteSubscriberSummary } from '@/lib/api-client';

const CONVERTED_STATUSES: ExpedienteStatus[] = ['INSTALACION_AGENDADA', 'CLIENTE_ACTIVO'];

export function ExpedienteConversionBanner({
  status,
  subscriberSummary,
}: {
  status: ExpedienteStatus;
  subscriberSummary?: ExpedienteSubscriberSummary | null;
}) {
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
