// apps/portal/src/components/dashboard/OnboardingAlerts.tsx
import Link from 'next/link';
import { AlertTriangle, Info, XCircle, ArrowRight } from 'lucide-react';
import type { DashboardAlert } from '@/lib/api-client';

interface OnboardingAlertsProps {
  alerts: DashboardAlert[];
}

const severityConfig = {
  info: {
    icon: Info,
    containerClass: 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20',
    iconClass: 'text-blue-600 dark:text-blue-400',
    titleClass: 'text-blue-800 dark:text-blue-300',
    textClass: 'text-blue-700 dark:text-blue-400',
    linkClass: 'text-blue-700 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-200',
  },
  warning: {
    icon: AlertTriangle,
    containerClass: 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20',
    iconClass: 'text-amber-600 dark:text-amber-400',
    titleClass: 'text-amber-800 dark:text-amber-300',
    textClass: 'text-amber-700 dark:text-amber-400',
    linkClass: 'text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200',
  },
  error: {
    icon: XCircle,
    containerClass: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20',
    iconClass: 'text-red-600 dark:text-red-400',
    titleClass: 'text-red-800 dark:text-red-300',
    textClass: 'text-red-700 dark:text-red-400',
    linkClass: 'text-red-700 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200',
  },
};

/**
 * Panel de alertas de onboarding del dashboard empresarial.
 * Muestra alertas generadas por el backend basadas en el estado real del tenant.
 * Si no hay alertas, renderiza un mensaje positivo — nunca un panel vacío sin contexto.
 *
 * HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §2.2 (BT-DE-09)
 */
export function OnboardingAlerts({ alerts }: OnboardingAlertsProps) {
  if (alerts.length === 0) {
    return (
      <div className="rounded-[20px] border border-green-200 bg-green-50 p-4 shadow-[var(--shadow-iwana-card)] dark:border-green-800 dark:bg-green-900/20">
        <div className="flex items-center gap-3">
          <Info
            className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0"
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-green-800 dark:text-green-300">
            Tu empresa está correctamente configurada. No hay alertas pendientes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" role="list" aria-label="Alertas de configuración">
      {alerts.map((alert) => {
        const config = severityConfig[alert.severity];
        const AlertIcon = config.icon;

        return (
          <div
            key={alert.id}
            role="listitem"
            className={`rounded-[20px] border p-4 shadow-[var(--shadow-iwana-card)] ${config.containerClass}`}
          >
            <div className="flex items-start gap-3">
              <AlertIcon
                className={`w-5 h-5 mt-0.5 shrink-0 ${config.iconClass}`}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-bold ${config.titleClass}`}>{alert.title}</p>
                <p className={`mt-1 text-sm leading-6 ${config.textClass}`}>{alert.description}</p>
                {alert.href && (
                  <Link
                    href={alert.href}
                    className={`mt-3 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide ${config.linkClass}`}
                  >
                    Ir a configuración
                    <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
