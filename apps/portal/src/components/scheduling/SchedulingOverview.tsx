'use client';

import Link from 'next/link';
import type { InternalUser, WfmDashboardSummary, WfmScheduleEvent } from '@/lib/api-client';
import { PortalAlert, PortalPanel } from '@/components/shared/portal-ui';
import { SchedulingAlertRail } from './SchedulingAlertRail';
import { SchedulingTimelineBoard } from './SchedulingTimelineBoard';

interface SchedulingOverviewProps {
  summary: WfmDashboardSummary | null;
  events: WfmScheduleEvent[];
  techniciansById: Map<string, InternalUser>;
  selectedDayKey: string;
  partialCoverageMessage?: string | null;
  onSelectEvent: (event: WfmScheduleEvent) => void;
  onFilterTechnician: (technicianId: string) => void;
}

export function SchedulingOverview({
  summary,
  events,
  techniciansById,
  selectedDayKey,
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] 2xl:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
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
    </div>
  );
}
