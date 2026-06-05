'use client';

import { Clock3 } from 'lucide-react';
import { Badge } from '@iwana/ui';
import type { InternalUser, WfmScheduleEvent } from '@/lib/api-client';
import { PortalEmptyState, PortalPanel } from '@/components/shared/portal-ui';
import { buildTimelineGroups } from './scheduling-ui';
import { ScheduleEventCard } from './ScheduleEventCard';

interface SchedulingTimelineBoardProps {
  events: WfmScheduleEvent[];
  techniciansById: Map<string, InternalUser>;
  selectedDayKey: string;
  onSelectEvent: (event: WfmScheduleEvent) => void;
}

export function SchedulingTimelineBoard({
  events,
  techniciansById,
  selectedDayKey,
  onSelectEvent,
}: SchedulingTimelineBoardProps) {
  const groups = buildTimelineGroups(events, techniciansById, selectedDayKey);

  return (
    <PortalPanel
      eyebrow="Seguimiento del día"
      title="Personas asignadas"
      description="Bloques ordenados por hora para abrir detalle operativo sin arrastrar y soltar."
    >
      {groups.length === 0 ? (
        <PortalEmptyState
          title="Sin eventos para el día"
          description="Ajusta el filtro desde o selecciona otro rango para revisar la jornada."
          icon={Clock3}
        />
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section
              key={group.technicianId}
              className="rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3"
              aria-label={`Timeline de ${group.technicianName}`}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {group.technicianName}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {group.events.length} eventos en la jornada
                  </p>
                </div>
                <Badge variant="neutral">{selectedDayKey}</Badge>
              </div>
              <div className="space-y-2">
                {group.events.map((event) => (
                  <ScheduleEventCard
                    key={event.id}
                    event={event}
                    technician={techniciansById.get(group.technicianId) ?? null}
                    variant="timeline"
                    onSelect={onSelectEvent}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </PortalPanel>
  );
}
