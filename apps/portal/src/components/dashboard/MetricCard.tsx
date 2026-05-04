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
  tone?: 'primary' | 'secondary' | 'warning';
}

function resolveIconTone(tone: NonNullable<MetricCardProps['tone']>) {
  switch (tone) {
    case 'secondary':
      return 'bg-iwana-secondary-100 text-iwana-secondary-700 dark:bg-iwana-secondary-700/20 dark:text-iwana-secondary-400';
    case 'warning':
      return 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400';
    case 'primary':
    default:
      return 'bg-iwana-primary-50 text-iwana-primary dark:bg-iwana-primary-800/40 dark:text-iwana-primary-300';
  }
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
  tone = 'primary',
}: MetricCardProps) {
  const iconToneClassName = resolveIconTone(tone);

  return (
    <Card className="border border-gray-200 dark:border-dark-border dark:bg-dark-surface-2">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
            <p className="mt-1 text-3xl font-bold text-[#17163A] dark:text-white/90">
              {value !== null ? (
                value.toLocaleString('es-CO')
              ) : (
                <span className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
                  {emptyLabel}
                </span>
              )}
            </p>
            {description && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">{description}</p>
            )}
          </div>
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconToneClassName}`}
            aria-hidden="true"
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
