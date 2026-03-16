// apps/web/src/components/dashboard/MetricCard.tsx
import type { ReactNode } from 'react';
import { Card, CardContent } from '@iwana/ui';

/** Datos del badge de tendencia que se muestra al pie de la card. */
interface TrendBadge {
  value: number;
  direction: 'up' | 'down' | 'neutral';
  label?: string;
}

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: string;
  icon: ReactNode;
  iconColor?: string;
  iconBg?: string;
  trend?: TrendBadge;
}

function resolveIconTone(iconBg: string, iconColor: string) {
  const toneKey = `${iconBg.toUpperCase()}|${iconColor.toUpperCase()}`;

  switch (toneKey) {
    case '#EAF5CC|#6A7A1C':
      return 'bg-iwana-secondary-100 text-iwana-secondary-700 dark:bg-iwana-secondary-700/20 dark:text-iwana-secondary-400';
    case '#DCFCE7|#22C55E':
      return 'bg-green-100 text-green-500 dark:bg-green-900/30 dark:text-green-400';
    case '#FEF2F2|#EF4444':
      return 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400';
    case '#EEEEFA|#17163A':
    default:
      return 'bg-iwana-primary-50 text-iwana-primary dark:bg-iwana-primary-800/40 dark:text-iwana-primary-300';
  }
}

/** Resuelve las clases de color del badge según la dirección de la tendencia. */
function resolveTrendClasses(direction: TrendBadge['direction']): string {
  switch (direction) {
    case 'up':
      return 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400';
    case 'down':
      return 'bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400';
    case 'neutral':
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-white/[0.03] dark:text-gray-400';
  }
}

/** Devuelve el carácter de flecha que representa la dirección de la tendencia. */
function trendArrow(direction: TrendBadge['direction']): string {
  if (direction === 'up') return '↑';
  if (direction === 'down') return '↓';
  return '→';
}

/**
 * Card de métrica para el dashboard administrativo.
 * Soporta un badge opcional de tendencia al pie de la card.
 */
export function MetricCard({
  title,
  value,
  change,
  icon,
  iconColor = '#17163A',
  iconBg = '#EEEEFA',
  trend,
}: MetricCardProps) {
  const iconToneClassName = resolveIconTone(iconBg, iconColor);

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
            <p className="mt-1 text-3xl font-bold text-[#17163A] dark:text-white/90">{value}</p>
            {change && <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">{change}</p>}
          </div>
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0 ${iconToneClassName}`}
            aria-hidden="true"
          >
            {icon}
          </div>
        </div>

        {trend && (
          <div className="mt-3">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${resolveTrendClasses(trend.direction)}`}
            >
              {trendArrow(trend.direction)} {trend.value.toFixed(2)}%
              {trend.label && (
                <span className="text-gray-400 dark:text-gray-500 ml-1">{trend.label}</span>
              )}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
