// apps/portal/src/components/dashboard/MetricCard.tsx
import { Card, CardContent } from '@iwana/ui';
import type { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: number | null;
  icon: LucideIcon;
  /** Texto a mostrar cuando value es null — nunca datos inventados */
  emptyLabel?: string;
  description?: string;
}

/**
 * Tarjeta de métrica individual del dashboard empresarial.
 * Cuando value es null, muestra emptyLabel — nunca un número inventado.
 *
 * HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §3.4 (campos opcionales como null)
 */
export function MetricCard({
  label,
  value,
  icon: Icon,
  emptyLabel = 'No disponible',
  description,
}: MetricCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
              {value !== null ? (
                value.toLocaleString('es-CO')
              ) : (
                <span className="text-base font-medium text-gray-400 dark:text-gray-500">
                  {emptyLabel}
                </span>
              )}
            </p>
            {description && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{description}</p>
            )}
          </div>
          <div
            className="w-10 h-10 shrink-0 rounded-lg bg-iwana-primary/10 dark:bg-iwana-primary/20 flex items-center justify-center"
            aria-hidden="true"
          >
            <Icon className="w-5 h-5 text-iwana-primary dark:text-iwana-primary-300" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
