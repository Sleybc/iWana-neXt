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
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">{title}</p>
            <p className="mt-1 text-3xl font-bold text-[#17163A]">{value}</p>
            {change && <p className="mt-1 text-xs text-gray-500">{change}</p>}
          </div>
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0"
            style={{ backgroundColor: iconBg, color: iconColor }}
            aria-hidden="true"
          >
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
