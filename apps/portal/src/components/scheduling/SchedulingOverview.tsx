'use client';

import { Badge } from '@iwana/ui';
import type { InternalUser, WfmDashboardSummary, WfmScheduleEvent } from '@/lib/api-client';
import { PortalAlert, PortalPanel } from '@/components/shared/portal-ui';
import { SchedulingAlertRail } from './SchedulingAlertRail';
import { SchedulingTimelineBoard } from './SchedulingTimelineBoard';
import { TechnicianLoadStrip } from './TechnicianLoadStrip';

interface SchedulingOverviewProps {
  summary: WfmDashboardSummary | null;
  events: WfmScheduleEvent[];
  techniciansById: Map<string, InternalUser>;
  selectedDayKey: string;
  selectedTechnicianId?: string;
  partialCoverageMessage?: string | null;
  onSelectEvent: (event: WfmScheduleEvent) => void;
  onFilterTechnician: (technicianId: string) => void;
}

function kpiValue(value: number | undefined): string {
  return typeof value === 'number' ? String(value) : 'No disponible';
}

export function SchedulingOverview({
  summary,
  events,
  techniciansById,
  selectedDayKey,
  selectedTechnicianId = '',
  partialCoverageMessage,
  onSelectEvent,
  onFilterTechnician,
}: SchedulingOverviewProps) {
  return (
    <div className="space-y-6">
      {partialCoverageMessage && (
        <PortalAlert
          variant="info"
          title="Cobertura parcial"
          description={partialCoverageMessage}
        />
      )}

      <PortalPanel
        eyebrow="Supervisión"
        title="Command center"
        description="KPIs priorizados para entender la operación diaria de WFM en segundos."
        actions={<Badge variant="primary">Vista operativa</Badge>}
      >
        {!summary && (
          <PortalAlert
            variant="warning"
            title="Resumen no disponible"
            description="El timeline sigue disponible con los eventos cargados del rango actual."
            className="mb-4"
          />
        )}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <KpiCard title="Activos" value={kpiValue(summary?.activeCount)} />
          <KpiCard title="Atrasados" value={kpiValue(summary?.overdueCount)} />
          <KpiCard title="Próximos 7 días" value={kpiValue(summary?.upcomingCount)} />
          <KpiCard title="En ruta" value={kpiValue(summary?.enRouteCount)} />
          <KpiCard title="En riesgo" value={kpiValue(summary?.atRiskCount)} />
        </div>
      </PortalPanel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <SchedulingTimelineBoard
          events={events}
          techniciansById={techniciansById}
          selectedDayKey={selectedDayKey}
          onSelectEvent={onSelectEvent}
        />
        <SchedulingAlertRail
          alerts={summary?.alerts ?? []}
          onOpenEvent={(eventId) => {
            const event = events.find((item) => item.id === eventId);
            if (event) {
              onSelectEvent(event);
            }
          }}
          onFilterTechnician={onFilterTechnician}
        />
      </div>

      <TechnicianLoadStrip
        summary={summary}
        techniciansById={techniciansById}
        selectedTechnicianId={selectedTechnicianId}
        onFilterTechnician={onFilterTechnician}
      />
    </div>
  );
}

function KpiCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-[#fbfcf8] p-4 dark:border-dark-border dark:bg-dark-surface-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
        {title}
      </p>
      <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}
