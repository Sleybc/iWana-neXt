'use client';

import { Badge } from '@iwana/ui';
import { StockIssueStatus } from '@iwana/shared';
import type { StockIssueRecord } from '@/lib/api-client';
import {
  PortalPanel,
  PortalSkeletonBlock,
  type PortalMetricCardAccent,
  interactiveFocusClassName,
  portalMetricCardAccentClassName,
  portalMetricCardShellClassName,
} from '@/components/shared/portal-ui';
import { cn } from '@iwana/ui';

export type StockIssueKpiPreset = 'requested' | 'approved' | 'picking' | 'ready';

interface MetricCardConfig {
  preset: StockIssueKpiPreset;
  status: StockIssueStatus;
  eyebrow: string;
  title: string;
  description: string;
  accent: PortalMetricCardAccent;
}

const METRIC_CARDS: MetricCardConfig[] = [
  {
    preset: 'requested',
    status: StockIssueStatus.REQUESTED,
    eyebrow: 'Ingreso',
    title: 'Solicitadas',
    description: 'Salidas registradas pendientes de confirmación interna.',
    accent: 'primary',
  },
  {
    preset: 'approved',
    status: StockIssueStatus.APPROVED,
    eyebrow: 'Aprobación',
    title: 'Aprobadas',
    description: 'Listas para preparar y revisar material antes de entregar.',
    accent: 'neutral',
  },
  {
    preset: 'picking',
    status: StockIssueStatus.PICKING,
    eyebrow: 'Preparación',
    title: 'En preparación',
    description: 'Material en preparación y verificación de cantidades.',
    accent: 'warning',
  },
  {
    preset: 'ready',
    status: StockIssueStatus.READY_TO_DISPATCH,
    eyebrow: 'Despacho',
    title: 'Listas para despacho',
    description: 'Listas para confirmar entrega y generar el movimiento.',
    accent: 'primary',
  },
];

function countMetric(issues: StockIssueRecord[], status: StockIssueStatus): number {
  return issues.filter((issue) => issue.status === status).length;
}

export interface StockIssuesSummaryProps {
  issues: StockIssueRecord[];
  activeStatus: StockIssueStatus | undefined;
  isLoading?: boolean;
  onStatusFilterChange: (status: StockIssueStatus) => void;
}

export function StockIssuesSummary({
  issues,
  activeStatus,
  isLoading = false,
  onStatusFilterChange,
}: StockIssuesSummaryProps) {
  return (
    <PortalPanel
      eyebrow="Despachos"
      title="Resumen de salidas"
      description="Indicadores para priorizar preparación, aprobación y despacho."
    >
      <section aria-label="Indicadores de salidas" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
            Haz clic en un indicador para filtrar por estado
          </p>
          <Badge variant="neutral" className="px-3 py-1 text-[11px] uppercase tracking-tight">
            Resumen rápido
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {METRIC_CARDS.map((metric) => {
            const value = countMetric(issues, metric.status);
            const isActive = activeStatus === metric.status;

            if (isLoading) {
              return (
                <PortalSkeletonBlock key={metric.preset} className="min-h-[148px] rounded-3xl" />
              );
            }

            return (
              <button
                key={metric.preset}
                type="button"
                aria-pressed={isActive}
                onClick={() => onStatusFilterChange(metric.status)}
                className={cn(
                  portalMetricCardShellClassName,
                  'min-h-[148px] w-full text-left transition',
                  portalMetricCardAccentClassName(metric.accent, { isActive }),
                  interactiveFocusClassName,
                )}
              >
                <p className="portal-eyebrow-muted">{metric.eyebrow}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
                  {value}
                </p>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {metric.title}
                </p>
                <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">
                  {metric.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>
    </PortalPanel>
  );
}
