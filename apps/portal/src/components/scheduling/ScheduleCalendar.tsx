'use client';

import { CalendarX2 } from 'lucide-react';
import { Badge } from '@iwana/ui';
import type { InternalUser, WfmScheduleEvent } from '@/lib/api-client';
import { PortalEmptyState, PortalPanel } from '@/components/shared/portal-ui';
import { type SchedulingCalendarDay } from './scheduling-ui';
import { ScheduleEventCard } from './ScheduleEventCard';

interface ScheduleCalendarProps {
  days: SchedulingCalendarDay[];
  techniciansById: Map<string, InternalUser>;
  onSelectEvent: (event: WfmScheduleEvent) => void;
}

export function ScheduleCalendar({ days, techniciansById, onSelectEvent }: ScheduleCalendarProps) {
  const totalEvents = days.reduce((total, day) => total + day.events.length, 0);

  return (
    <PortalPanel
      eyebrow="Agenda"
      title="Agenda por día"
      description="Consulta los horarios agendados por día sin salir del centro de agendamiento."
      actions={
        <Badge variant="neutral" className="px-3 py-1 text-[11px] uppercase tracking-[0.18em]">
          {totalEvents} eventos
        </Badge>
      }
    >
      {days.length === 0 ? (
        <PortalEmptyState
          title="No hay días visibles"
          description="Ajusta el rango de fechas para revisar horarios disponibles en esta vista."
          icon={CalendarX2}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          {days.map((day) => (
            <section
              key={day.key}
              className="rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3"
              aria-label={day.label}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{day.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {day.events.length} agendados
                  </p>
                </div>
                <Badge variant="lime">{day.shortLabel}</Badge>
              </div>

              {day.events.length === 0 ? (
                <PortalEmptyState
                  title="Día libre"
                  description="No hay eventos cargados para esta fecha en el rango actual."
                  className="border-dashed bg-white/80 dark:bg-dark-surface-2"
                  icon={CalendarX2}
                />
              ) : (
                <div className="space-y-3">
                  {day.events.map((event) => {
                    const technician = techniciansById.get(event.assignedUserId);

                    return (
                      <ScheduleEventCard
                        key={event.id}
                        event={event}
                        technician={technician ?? null}
                        variant="calendar"
                        onSelect={onSelectEvent}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </PortalPanel>
  );
}
