'use client';

import Link from 'next/link';
import { Badge } from '@iwana/ui';
import type { WfmDashboardSummary } from '@/lib/api-client';

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
  highlighted,
}: {
  eyebrow: string;
  title: string;
  value: string;
  description: string;
  detail?: string;
  actionHref?: string;
  actionLabel?: string;
  highlighted?: boolean;
}) {
  return (
    <article
      className={`rounded-3xl border bg-white/75 p-5 shadow-iwana backdrop-blur-xl dark:bg-dark-surface-2/80 ${
        highlighted
          ? 'border-iwana-secondary-200 dark:border-iwana-secondary-400/35'
          : 'border-white/70 dark:border-dark-border'
      }`}
    >
      <div
        className={`rounded-2xl p-0 ${
          highlighted
            ? 'bg-[radial-gradient(circle_at_top_right,rgba(165,195,48,0.22),transparent_36%)]'
            : 'bg-[radial-gradient(circle_at_top_right,rgba(165,195,48,0.14),transparent_34%)]'
        }`}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
          {eyebrow}
        </p>
        <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">{value}</p>
        <p className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-200">{title}</p>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{description}</p>
        {detail ? <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{detail}</p> : null}
        {actionHref && actionLabel ? (
          <Link
            href={actionHref}
            className="mt-3 inline-flex items-center text-sm font-medium text-iwana-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-surface-2"
          >
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </article>
  );
}

export function SchedulingSummaryStrip({
  summary,
  isLoading = false,
}: SchedulingSummaryStripProps) {
  const pendingInbox =
    summary?.pendingInbox ??
    ({
      totalOpen: 0,
      readyToScheduleCount: 0,
      needsContextCount: 0,
      overdueSlaCount: 0,
      highPriorityOpenCount: 0,
    } satisfies WfmDashboardSummary['pendingInbox']);

  const pendingValue = formatMetric(pendingInbox.totalOpen, isLoading);
  const todayValue = formatMetric(summary?.todayCount, isLoading);
  const assignedValue = formatMetric(summary?.technicianLoad.length, isLoading);
  const alertsValue = formatMetric(summary?.alerts.length ?? summary?.atRiskCount, isLoading);

  return (
    <section aria-label="Resumen de agendamiento" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
          Estado actual del centro de agendamiento
        </p>
        <Badge variant="neutral" className="px-3 py-1 text-[11px] uppercase tracking-[0.12em]">
          Lectura en tiempo real
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <SummaryCard
          eyebrow="Bandeja"
          title="Pendientes por agendar"
          value={pendingValue}
          description={`Listas para agendar: ${formatMetric(pendingInbox.readyToScheduleCount, isLoading)} · Faltan datos: ${formatMetric(pendingInbox.needsContextCount, isLoading)}`}
          detail={`Con tiempo comprometido vencido: ${formatMetric(pendingInbox.overdueSlaCount, isLoading)}`}
          actionHref="/dashboard/scheduling/pending-visits"
          actionLabel="Abrir bandeja"
          highlighted
        />

        <SummaryCard
          eyebrow="Agenda"
          title="Eventos de hoy"
          value={todayValue}
          description="Tareas activas de la jornada para seguimiento inmediato."
        />

        <SummaryCard
          eyebrow="Capacidad"
          title="Personas asignadas"
          value={assignedValue}
          description="Equipo con carga operativa dentro del rango seleccionado."
        />

        <SummaryCard
          eyebrow="Alertas"
          title="Alertas de agenda"
          value={alertsValue}
          description="Situaciones que requieren atencion para mantener continuidad operativa."
        />
      </div>
    </section>
  );
}
