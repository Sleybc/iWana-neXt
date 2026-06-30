'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { Badge } from '@iwana/ui';
import type { InternalUser, WfmDashboardSummary, WfmScheduleEvent } from '@/lib/api-client';
import { PortalEmptyState, PortalPanel } from '@/components/shared/portal-ui';
import { getTechnicianLoadRiskLabel, getTechnicianLoadRiskVariant } from './scheduling-ui';
import { SchedulingAlertRail } from './SchedulingAlertRail';
import { SchedulingSummaryStrip } from './SchedulingSummaryStrip';
import { SchedulingTimelineBoard } from './SchedulingTimelineBoard';

interface SchedulingDashboardProps {
  summary: WfmDashboardSummary | null;
  events: WfmScheduleEvent[];
  techniciansById: Map<string, InternalUser>;
  selectedDayKey: string;
  isLoading: boolean;
  onSelectEvent: (event: WfmScheduleEvent) => void;
  onFilterTechnician: (technicianId: string) => void;
}

function SchedulingCapacityPanel({
  summary,
  techniciansById,
}: {
  summary: WfmDashboardSummary | null;
  techniciansById: Map<string, InternalUser>;
}) {
  const loadRows = useMemo(
    () =>
      [...(summary?.technicianLoad ?? [])]
        .sort((left, right) => right.utilizationPercent - left.utilizationPercent)
        .slice(0, 5),
    [summary?.technicianLoad],
  );

  return (
    <PortalPanel
      eyebrow="Capacidad"
      title="Capacidad operativa"
      description="Lectura compacta para detectar sobrecarga, reparto desigual o margen disponible sin abrir todavía la agenda completa."
      contentClassName="space-y-3"
    >
      {loadRows.length === 0 ? (
        <PortalEmptyState
          title="Sin carga operativa visible"
          description="Cuando existan asignaciones en la jornada, aquí aparecerá la distribución del equipo."
          icon={Users}
        />
      ) : (
        <div className="space-y-3">
          {loadRows.map((item) => {
            const technician = techniciansById.get(item.assignedUserId);
            const technicianName =
              technician?.firstName || technician?.lastName
                ? `${technician?.firstName ?? ''} ${technician?.lastName ?? ''}`.trim()
                : 'Responsable sin nombre';

            return (
              <Link
                key={item.assignedUserId}
                href={`/dashboard/scheduling/agenda?technicianId=${item.assignedUserId}`}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-iwana-primary/30 hover:bg-gray-50 dark:border-dark-border dark:bg-dark-surface-2 dark:hover:bg-dark-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-1"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                    {technicianName}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {item.todayCount} tarea(s) · {Math.round(item.utilizationPercent)}% de ocupación
                  </p>
                </div>
                <Badge variant={getTechnicianLoadRiskVariant(item.riskLevel)}>
                  {getTechnicianLoadRiskLabel(item.riskLevel)}
                </Badge>
              </Link>
            );
          })}
        </div>
      )}
    </PortalPanel>
  );
}

export function SchedulingDashboard({
  summary,
  events,
  techniciansById,
  selectedDayKey,
  isLoading,
  onSelectEvent,
  onFilterTechnician,
}: SchedulingDashboardProps) {
  return (
    <div className="space-y-6">
      <SchedulingSummaryStrip summary={summary} isLoading={isLoading} />

      <SchedulingAlertRail
        alerts={summary?.alerts ?? []}
        onOpenEvent={(eventId) => {
          const event = events.find((item) => item.id === eventId);
          if (event) {
            onSelectEvent(event);
          }
        }}
        onFilterTechnician={onFilterTechnician}
        eyebrow="Riesgos"
        title="Riesgos que requieren atención"
        description="Alertas priorizadas para intervenir antes de que la jornada pierda continuidad."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <SchedulingTimelineBoard
          events={events}
          techniciansById={techniciansById}
          selectedDayKey={selectedDayKey}
          onSelectEvent={onSelectEvent}
          eyebrow="Agenda del día"
          title="Jornada asignada hoy"
          description="Vista rápida para entender qué personas ya tienen carga operativa y dónde conviene abrir detalle."
        />

        <SchedulingCapacityPanel summary={summary} techniciansById={techniciansById} />
      </div>
    </div>
  );
}
