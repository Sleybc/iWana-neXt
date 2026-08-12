import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Badge, Button } from '@iwana/ui';
import type { DashboardAlert } from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalNavListRow,
  PortalPanel,
  portalInlineTextLinkClassName,
} from '@/components/shared/portal-ui';

export type OnboardingOperationState = 'unknown' | 'not-started' | 'active';

interface OnboardingAlertsProps {
  alerts: DashboardAlert[];
  isUpdating?: boolean;
  operationState?: OnboardingOperationState;
}

const FIRST_OPERATION_ACTIONS = [
  {
    title: 'Crea tu primer plan',
    meta: 'Define una oferta para comenzar a vender.',
    href: '/dashboard/commercial?tab=plans',
  },
  {
    title: 'Registra tu primer suscriptor',
    meta: 'Añade el primer registro de tu base.',
    href: '/dashboard/crm/subscribers/new',
  },
  {
    title: 'Programa tu primera visita',
    meta: 'Lleva tu primera visita a la agenda.',
    href: '/dashboard/scheduling?open=create',
  },
] as const;

function alertVariant(severity: DashboardAlert['severity']): 'info' | 'warning' | 'error' {
  if (severity === 'error') return 'error';
  if (severity === 'warning') return 'warning';
  return 'info';
}

/**
 * Próximo paso de configuración (B2b).
 * Sin mapa de severidad local: `PortalAlert` aporta contraste medido (DS §3.1).
 */
export function OnboardingAlerts({
  alerts,
  isUpdating = false,
  operationState = 'unknown',
}: OnboardingAlertsProps) {
  if (alerts.length === 0) {
    if (operationState === 'active') return null;

    if (operationState === 'not-started') {
      return (
        <PortalPanel title="Empieza tu operación">
          {isUpdating ? (
            <p className="mb-3 text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
              Actualizando
            </p>
          ) : null}
          <nav aria-label="Primeros pasos de operación">
            <ul className="space-y-2">
              {FIRST_OPERATION_ACTIONS.map((action) => (
                <li key={action.href}>
                  <PortalNavListRow
                    href={action.href}
                    title={action.title}
                    meta={action.meta}
                    trailing={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
                  />
                </li>
              ))}
            </ul>
          </nav>
        </PortalPanel>
      );
    }

    return (
      <PortalPanel title="Estado de configuración">
        {isUpdating ? (
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
            Actualizando
          </p>
        ) : null}
        <PortalEmptyState
          title="Configuración al día"
          description="Tu empresa no tiene pasos pendientes. Puedes revisar el detalle cuando lo necesites."
          action={
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="lime">Al día</Badge>
              <Link href="/dashboard/settings" className={portalInlineTextLinkClassName}>
                Ver configuración
              </Link>
            </div>
          }
        />
      </PortalPanel>
    );
  }

  const next = alerts[0]!;
  const rest = alerts.slice(1);
  const pendingCount = alerts.length;

  return (
    <PortalPanel
      title="Próximo paso de configuración"
      description={
        pendingCount > 1
          ? `${pendingCount} pendientes · empieza por el paso destacado`
          : 'Un paso pendiente para completar la configuración'
      }
    >
      {isUpdating ? (
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
          Actualizando
        </p>
      ) : null}
      <div className="space-y-3" role="list" aria-label="Pasos de configuración">
        <div role="listitem">
          <PortalAlert
            variant={alertVariant(next.severity)}
            title={next.title}
            description={next.description}
            live="polite"
            action={
              next.href ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={next.href} className="inline-flex min-h-11 items-center">
                    Ir a configuración
                  </Link>
                </Button>
              ) : undefined
            }
          />
        </div>

        {rest.length > 0 ? (
          <details className="rounded-xl border border-gray-100 px-3 py-2 dark:border-dark-border">
            <summary className="cursor-pointer text-sm font-medium text-iwana-primary dark:text-iwana-primary-300">
              Ver los {rest.length} pendientes restantes
            </summary>
            <div className="mt-3 space-y-3">
              {rest.map((alert) => (
                <div key={alert.id} role="listitem">
                  <PortalAlert
                    variant={alertVariant(alert.severity)}
                    title={alert.title}
                    description={alert.description}
                    live="off"
                    action={
                      alert.href ? (
                        <Button asChild variant="ghost" size="sm">
                          <Link href={alert.href} className="inline-flex min-h-11 items-center">
                            Ir a configuración
                          </Link>
                        </Button>
                      ) : undefined
                    }
                  />
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </PortalPanel>
  );
}
