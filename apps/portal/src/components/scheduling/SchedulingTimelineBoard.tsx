'use client';

import { Clock3 } from 'lucide-react';
import { Badge } from '@iwana/ui';
import type { InternalUser, WfmScheduleEvent } from '@/lib/api-client';
import { PortalEmptyState, PortalPanel } from '@/components/shared/portal-ui';
import {
  buildTimelineGroups,
  formatWfmTime,
  getScheduleEventStatusLabel,
  getScheduleEventStatusVariant,
  getWfmWorkTypeLabel,
  getWfmWorkTypeVariant,
} from './scheduling-ui';

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
      eyebrow="Timeline diario"
      title="Supervisión por técnico"
      description="Bloques ordenados por hora para abrir detalle operativo sin drag-and-drop."
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
              className="rounded-2xl border border-gray-200 bg-[#fbfcf8] p-4 dark:border-dark-border dark:bg-dark-surface-3"
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
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onSelectEvent(event)}
                    aria-label={`Abrir evento ${event.title}`}
                    className="w-full rounded-2xl border border-gray-200 bg-white p-3 text-left transition hover:border-iwana-primary/30 hover:bg-iwana-primary-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2 dark:border-dark-border dark:bg-dark-surface-2 dark:hover:border-iwana-primary-300/40"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white">{event.title}</p>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          {formatWfmTime(event.scheduledStartAt)} -{' '}
                          {formatWfmTime(event.scheduledEndAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={getWfmWorkTypeVariant(event.type)}>
                          {getWfmWorkTypeLabel(event.type)}
                        </Badge>
                        <Badge variant={getScheduleEventStatusVariant(event.status)}>
                          {getScheduleEventStatusLabel(event.status)}
                        </Badge>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </PortalPanel>
  );
}
