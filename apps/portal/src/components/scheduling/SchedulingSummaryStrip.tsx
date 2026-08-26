'use client';

import Link from 'next/link';
import { Badge, cn } from '@iwana/ui';
import type { WfmDashboardSummary } from '@/lib/api-client';
import {
  type PortalMetricCardAccent,
  portalMetricCardAccentClassName,
  portalMetricCardShellClassName,
} from '@/components/shared/portal-ui';

interface SchedulingSummaryStripProps {
  summary: WfmDashboardSummary | null;
  isLoading?: boolean;
}

function formatMetric(value: number | undefined, isLoading: boolean): string {
  if (isLoading) {
    return '...';
  }

  return typeof value === 'number' ? String(value) : 'No disponible';
}

function SummaryCard({
  eyebrow,
  title,
  value,
  description,
  detail,
  actionHref,
  actionLabel,
  accent = 'neutral',
}: {
  eyebrow: string;
  title: string;
  value: string;
  description: string;
  detail: string;
  actionHref?: string;
  actionLabel?: string;
  accent?: PortalMetricCardAccent;
}) {
  return (
    <article
      className={cn(
        portalMetricCardShellClassName,
        'min-h-[168px]',
        portalMetricCardAccentClassName(accent),
      )}
    >
      <p className="portal-eyebrow-muted">{eyebrow}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
        {value}
      </p>
      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{title}</p>
      <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">{description}</p>
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{detail}</p>

      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className="mt-auto pt-4 text-sm font-medium text-iwana-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-surface-2"
        >
          {actionLabel}
        </Link>
      ) : null}
    </article>
  );
}

export function SchedulingSummaryStrip({
  summary,
  isLoading = false,
}: SchedulingSummaryStripProps) {
  const pendingInbox = summary?.pendingInbox ?? {
    totalOpen: 0,
    readyToScheduleCount: 0,
    needsContextCount: 0,
    overdueSlaCount: 0,
    highPriorityOpenCount: 0,
  };

  const pendingValue = formatMetric(pendingInbox.totalOpen, isLoading);
  const activeValue = formatMetric(summary?.activeCount, isLoading);
  const overdueValue = formatMetric(summary?.overdueCount, isLoading);
  const upcomingValue = formatMetric(summary?.upcomingCount, isLoading);
  const enRouteValue = formatMetric(summary?.enRouteCount, isLoading);
  const atRiskValue = formatMetric(summary?.atRiskCount ?? summary?.alerts.length, isLoading);

  return (
    <section aria-label="Resumen operativo" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
          Datos básicos del módulo para abrir la jornada con contexto
        </p>
        <Badge variant="neutral" className="px-3 py-1 text-[11px] uppercase tracking-tight">
          Lectura operativa
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <SummaryCard
          eyebrow="Pendientes"
          title="Pendientes por agendar"
          value={pendingValue}
          description="Solicitudes abiertas que todavía esperan decisión operativa."
          detail={`Listas: ${formatMetric(pendingInbox.readyToScheduleCount, isLoading)} · Falta contexto: ${formatMetric(pendingInbox.needsContextCount, isLoading)}`}
          actionHref="/dashboard/scheduling/pending-visits"
          actionLabel="Abrir pendientes"
          accent="primary"
        />

        <SummaryCard
          eyebrow="Activas"
          title="Activas hoy"
          value={activeValue}
          description="Tareas en curso que ya están comprometiendo capacidad de la jornada."
          detail={`Programadas hoy: ${formatMetric(summary?.todayCount, isLoading)}`}
          actionHref="/dashboard/scheduling/agenda"
          actionLabel="Ir a agenda"
        />

        <SummaryCard
          eyebrow="Atrasadas"
          title="Atrasadas"
          value={overdueValue}
          description="Eventos que ya quedaron por fuera de su franja prevista."
          detail="Conviene intervenir antes de que afecten el resto del día."
          accent="danger"
          actionHref="/dashboard/scheduling/unrealized-visits"
          actionLabel="Visitas sin realizar"
        />

        <SummaryCard
          eyebrow="Horizonte"
          title="Próximos 7 días"
          value={upcomingValue}
          description="Carga ya comprometida para el corto plazo del equipo."
          detail={`Alta prioridad abierta: ${formatMetric(pendingInbox.highPriorityOpenCount, isLoading)}`}
        />

        <SummaryCard
          eyebrow="Desplazamiento"
          title="En ruta"
          value={enRouteValue}
          description="Tareas que ya están en movimiento hacia ejecución."
          detail="Útil para revisar continuidad y tiempos de llegada."
          accent="warning"
        />

        <SummaryCard
          eyebrow="Riesgo"
          title="En riesgo"
          value={atRiskValue}
          description="Casos que piden seguimiento para sostener la continuidad operativa."
          detail={`Alertas activas: ${formatMetric(summary?.alerts.length, isLoading)}`}
          accent="warning"
        />
      </div>
    </section>
  );
}
