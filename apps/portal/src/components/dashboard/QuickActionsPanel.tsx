// apps/portal/src/components/dashboard/QuickActionsPanel.tsx
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@iwana/ui';
import { Settings, Users, ShieldCheck, BarChart3, ArrowRight, Zap } from 'lucide-react';

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
 * Ítems disponibles en MVP: /settings.
 * Módulos futuros marcados como no disponibles — no generan 404.
 *
 * HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §2.2 (BT-DE-11)
 */
const quickActions: QuickAction[] = [
  {
    label: 'Configuración',
    description: 'Zona horaria, moneda y datos de empresa',
    href: '/settings',
    icon: Settings,
    available: true,
  },
  {
    label: 'Usuarios',
    description: 'Gestión de usuarios y roles del equipo',
    href: '/users',
    icon: Users,
    available: false,
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="w-4 h-4 text-iwana-secondary-700" aria-hidden="true" />
          Accesos rápidos
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {quickActions.map((action) => {
            if (action.available) {
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-sm hover:border-iwana-primary hover:bg-iwana-primary-50 transition-all dark:border-gray-700 dark:hover:border-iwana-primary-300 dark:hover:bg-iwana-primary/10"
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
                className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3 text-sm cursor-not-allowed opacity-50 dark:border-gray-800"
                aria-disabled="true"
              >
                <span className="flex items-center gap-3">
                  <action.icon className="w-4 h-4 text-gray-400 shrink-0" aria-hidden={true} />
                  <span className="min-w-0">
                    <span className="block font-medium text-gray-500 dark:text-gray-400">
                      {action.label}
                    </span>
                    <span className="block text-xs text-gray-400 dark:text-gray-500 truncate">
                      {action.description}
                    </span>
                  </span>
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-dark-surface-3 text-gray-400 font-medium shrink-0 ml-2">
                  Próximo
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
