'use client';

import { Badge } from '@iwana/ui';
import { StockIssueStatus } from '@iwana/shared';
import type { StockIssueRecord } from '@/lib/api-client';
import { PortalSkeletonBlock, interactiveFocusClassName } from '@/components/shared/portal-ui';
import { getStockIssueStatusLabel } from './inventory-labels';

export type StockIssueKpiPreset = 'requested' | 'approved' | 'picking' | 'ready';

interface MetricCardConfig {
  preset: StockIssueKpiPreset;
  status: StockIssueStatus;
  eyebrow: string;
  title: string;
  description: string;
  accent: 'neutral' | 'primary' | 'warning';
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
    description: 'Listas para preparar y validar stock antes del despacho.',
    accent: 'neutral',
  },
  {
    preset: 'picking',
    status: StockIssueStatus.PICKING,
    eyebrow: 'Preparación',
    title: 'En picking',
    description: 'Material en preparación y verificación de cantidades.',
    accent: 'warning',
  },
  {
    preset: 'ready',
    status: StockIssueStatus.READY_TO_DISPATCH,
    eyebrow: 'Despacho',
    title: 'Listas para despacho',
    description: 'Listas para confirmar entrega y generar el movimiento.',
    accent: 'warning',
  },
];

function countMetric(issues: StockIssueRecord[], status: StockIssueStatus): number {
  return issues.filter((issue) => issue.status === status).length;
}

function accentClassName(accent: MetricCardConfig['accent'], isActive: boolean): string {
  const base =
    accent === 'primary'
      ? 'border-iwana-primary/20 bg-iwana-primary-50/70 dark:border-iwana-primary-400/30 dark:bg-iwana-primary-900/15'
      : accent === 'warning'
        ? 'border-amber-200 bg-amber-50/80 dark:border-amber-500/20 dark:bg-amber-950/20'
        : 'border-gray-200 bg-iwana-surface-soft dark:border-dark-border dark:bg-dark-surface-3';

  return isActive ? `${base} ring-2 ring-iwana-primary/40` : base;
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
    <section aria-label="Indicadores de salidas" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
          Haz clic en un indicador para filtrar por estado
        </p>
        <Badge variant="neutral" className="px-3 py-1 text-[11px] uppercase tracking-tight">
          Lectura operativa
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
              className={`flex h-full min-h-[148px] w-full flex-col rounded-3xl border px-4 py-4 text-left shadow-sm transition ${accentClassName(metric.accent, isActive)} ${interactiveFocusClassName}`}
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
              <p className="mt-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                {getStockIssueStatusLabel(metric.status)}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
