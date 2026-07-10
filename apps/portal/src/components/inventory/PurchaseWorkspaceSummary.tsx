'use client';

import { Badge } from '@iwana/ui';
import { PurchaseRequestPriority, PurchaseRequestStatus } from '@iwana/shared';
import type { PurchaseRequestRecord } from '@/lib/api-client';
import {
  PortalPanel,
  PortalSkeletonBlock,
  type PortalMetricCardAccent,
  interactiveFocusClassName,
  portalMetricCardAccentClassName,
  portalMetricCardShellClassName,
} from '@/components/shared/portal-ui';
import { cn } from '@iwana/ui';
import {
  type PurchaseKpiPreset,
  isPurchaseRequestOverdue,
  resolveActiveKpiPreset,
  type PurchaseRequestFilters,
} from './purchase-filters';

interface PurchaseWorkspaceSummaryProps {
  requests: PurchaseRequestRecord[];
  filters: PurchaseRequestFilters;
  isLoading?: boolean;
  onKpiFilterChange: (preset: PurchaseKpiPreset) => void;
}

interface MetricCardConfig {
  preset: PurchaseKpiPreset;
  eyebrow: string;
  title: string;
  description: string;
  accent: PortalMetricCardAccent;
}

const METRIC_CARDS: MetricCardConfig[] = [
  {
    preset: 'pendingQuotes',
    eyebrow: 'Cotización',
    title: 'Por cotizar',
    description: 'Solicitudes esperando ofertas de proveedor.',
    accent: 'primary',
  },
  {
    preset: 'pendingApproval',
    eyebrow: 'Aprobación',
    title: 'Por aprobar',
    description: 'Casos listos o bloqueados para decisión.',
    accent: 'warning',
  },
  {
    preset: 'readyForPo',
    eyebrow: 'Orden de compra',
    title: 'Listas para orden de compra',
    description: 'Solicitudes aprobadas pendientes de emitir la orden.',
    accent: 'primary',
  },
  {
    preset: 'pendingReceipt',
    eyebrow: 'Recepción',
    title: 'Por recibir',
    description: 'Órdenes emitidas con mercancía en tránsito.',
    accent: 'neutral',
  },
  {
    preset: 'urgent',
    eyebrow: 'Prioridad',
    title: 'Urgentes',
    description: 'Solicitudes marcadas con prioridad urgente.',
    accent: 'danger',
  },
  {
    preset: 'overdue',
    eyebrow: 'Plazo',
    title: 'Vencidas',
    description: 'Fecha requerida superada sin cierre.',
    accent: 'danger',
  },
];

function countMetric(requests: PurchaseRequestRecord[], preset: PurchaseKpiPreset): number {
  switch (preset) {
    case 'pendingQuotes':
      return requests.filter((r) => r.status === PurchaseRequestStatus.PENDING_QUOTES).length;
    case 'pendingApproval':
      return requests.filter((r) => r.status === PurchaseRequestStatus.PENDING_APPROVAL).length;
    case 'readyForPo':
      return requests.filter((r) => r.status === PurchaseRequestStatus.APPROVED).length;
    case 'pendingReceipt':
      return requests.filter((r) => r.status === PurchaseRequestStatus.CONVERTED_TO_PO).length;
    case 'urgent':
      return requests.filter((r) => r.priority === PurchaseRequestPriority.URGENT).length;
    case 'overdue':
      return requests.filter(isPurchaseRequestOverdue).length;
    default:
      return 0;
  }
}

export function PurchaseWorkspaceSummary({
  requests,
  filters,
  isLoading = false,
  onKpiFilterChange,
}: PurchaseWorkspaceSummaryProps) {
  const activePreset = resolveActiveKpiPreset(filters);

  return (
    <PortalPanel
      eyebrow="Listado"
      title="Resumen de compras"
      description="Indicadores para priorizar cotizaciones, aprobaciones y recepciones."
    >
      <section aria-label="Indicadores de compras" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
            Haz clic en un indicador para filtrar el listado
          </p>
          <Badge variant="neutral" className="px-3 py-1 text-[11px] uppercase tracking-tight">
            Resumen rápido
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {METRIC_CARDS.map((metric) => {
            const value = countMetric(requests, metric.preset);
            const isActive = activePreset === metric.preset;

            if (isLoading) {
              return (
                <PortalSkeletonBlock key={metric.preset} className="min-h-[168px] rounded-3xl" />
              );
            }

            return (
              <button
                key={metric.preset}
                type="button"
                aria-pressed={isActive}
                onClick={() => onKpiFilterChange(metric.preset)}
                className={cn(
                  portalMetricCardShellClassName,
                  'min-h-[168px] w-full text-left transition',
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
