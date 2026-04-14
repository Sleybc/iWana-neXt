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
  emptyLabel = 'En consolidación',
  description,
}: MetricCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
              {label}
            </p>
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
              {value !== null ? (
                value.toLocaleString('es-CO')
              ) : (
                <span className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
                  {emptyLabel}
                </span>
              )}
            </p>
            {description && (
              <p className="mt-1 text-xs leading-5 text-gray-400 dark:text-gray-500">{description}</p>
            )}
          </div>
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] bg-iwana-primary/10 dark:bg-iwana-primary/20"
            aria-hidden="true"
          >
            <Icon className="h-5 w-5 text-iwana-primary dark:text-iwana-primary-300" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
