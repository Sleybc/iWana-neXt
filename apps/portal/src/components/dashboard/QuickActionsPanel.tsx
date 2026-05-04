// apps/portal/src/components/dashboard/QuickActionsPanel.tsx
import Link from 'next/link';
import { Settings, Users, ShieldCheck, BarChart3, ArrowRight, Zap, HandCoins } from 'lucide-react';
import { DashboardPanel } from './DashboardPanel';
import { interactiveFocusClassName } from '@/components/shared/portal-ui';

interface QuickAction {
  label: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  available: boolean;
}

/**
 * Accesos rápidos del dashboard empresarial.
 *
 * Ítems disponibles en MVP: /dashboard/settings, /dashboard/commercial.
 * Módulos futuros marcados como no disponibles — no generan 404.
 *
 * HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §2.2 (BT-DE-11)
 */
const quickActions: QuickAction[] = [
  {
    label: 'Comercial',
    description: 'Catálogo comercial, precios vigentes y reglas operativas',
    href: '/dashboard/commercial',
    icon: HandCoins,
    available: true,
  },
  {
    label: 'Configuración',
    description: 'Zona horaria, moneda y datos de empresa',
    href: '/dashboard/settings',
    icon: Settings,
    available: true,
  },
  {
    label: 'Usuarios',
    description: 'Gestión de usuarios y roles del equipo',
    href: '/dashboard/users',
    icon: Users,
    available: true,
  },
  {
    label: 'Seguridad',
    description: 'Políticas de acceso y MFA',
    href: '/security',
    icon: ShieldCheck,
    available: false,
  },
  {
    label: 'Reportes',
    description: 'Métricas operativas y reportes gerenciales',
    href: '/reports',
    icon: BarChart3,
    available: false,
  },
];

export function QuickActionsPanel() {
  return (
    <DashboardPanel title="Accesos rápidos">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {quickActions.map((action) => {
          if (action.available) {
            return (
              <Link
                key={action.href}
                href={action.href}
                className={`flex items-center justify-between rounded-xl border border-gray-200 px-4 py-4 text-sm transition-all hover:-translate-y-0.5 hover:border-iwana-primary hover:bg-iwana-primary-50 dark:border-dark-border dark:hover:border-iwana-primary-300 dark:hover:bg-iwana-primary/10 ${interactiveFocusClassName}`}
              >
                <span className="flex items-center gap-3">
                  <action.icon
                    className="w-4 h-4 text-iwana-secondary-700 dark:text-iwana-secondary shrink-0"
                    aria-hidden={true}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-gray-800 dark:text-white">
                      {action.label}
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">
                      {action.description}
                    </span>
                  </span>
                </span>
                <ArrowRight className="w-4 h-4 text-gray-400 shrink-0 ml-2" aria-hidden={true} />
              </Link>
            );
          }

          // Módulos futuros — no navegables, visualmente deshabilitados
          return (
            <div
              key={action.href}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-[#f8faf5] px-4 py-4 text-sm dark:border-dark-border dark:bg-dark-surface-3"
              aria-disabled="true"
            >
              <span className="flex items-center gap-3">
                <action.icon className="w-4 h-4 text-gray-400 shrink-0" aria-hidden={true} />
                <span className="min-w-0">
                  <span className="block font-medium text-gray-700 dark:text-gray-200">
                    {action.label}
                  </span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">
                    {action.description}
                  </span>
                </span>
              </span>
              <span className="ml-2 shrink-0 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:border-dark-border-2 dark:bg-dark-surface-2 dark:text-gray-300">
                Fase siguiente
              </span>
            </div>
          );
        })}

        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
          <Zap
            className="h-3.5 w-3.5 text-iwana-secondary-700 dark:text-iwana-secondary-400"
            aria-hidden="true"
          />
          {quickActions.filter((action) => action.available).length} accesos disponibles hoy
        </div>
      </div>
    </DashboardPanel>
  );
}
