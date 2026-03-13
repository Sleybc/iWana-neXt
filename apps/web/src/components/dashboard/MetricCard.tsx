// apps/web/src/components/dashboard/MetricCard.tsx
import type { ReactNode } from 'react';
import { Card, CardContent } from '@iwana/ui';

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: string;
  icon: ReactNode;
  iconColor?: string;
  iconBg?: string;
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

/**
 * Card de métrica para el dashboard administrativo.
 */
export function MetricCard({
  title,
  value,
  change,
  icon,
  iconColor = '#17163A',
  iconBg = '#EEEEFA',
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
      </CardContent>
    </Card>
  );
}
