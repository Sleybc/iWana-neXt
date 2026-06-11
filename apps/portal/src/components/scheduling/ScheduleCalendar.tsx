'use client';

import { CalendarX2 } from 'lucide-react';
import { Badge } from '@iwana/ui';
import type { InternalUser, WfmScheduleEvent } from '@/lib/api-client';
import { PortalEmptyState, PortalPanel } from '@/components/shared/portal-ui';
import type { SchedulingCalendarDay, SchedulingView } from './scheduling-ui';
import { ScheduleEventCard } from './ScheduleEventCard';

interface ScheduleCalendarProps {
  days: SchedulingCalendarDay[];
  techniciansById: Map<string, InternalUser>;
  view: Exclude<SchedulingView, 'list'>;
  onSelectEvent: (event: WfmScheduleEvent) => void;
}

const weekdayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function getMonthGridOffset(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function ScheduleCalendar({
  days,
  techniciansById,
  view,
  onSelectEvent,
}: ScheduleCalendarProps) {
  const totalEvents = days.reduce((total, day) => total + day.events.length, 0);
  const title =
    view === 'day' ? 'Agenda del día' : view === 'week' ? 'Agenda semanal' : 'Vista mensual';
  const description =
    view === 'day'
      ? 'Revisa en detalle la jornada seleccionada y despacha con contexto activo.'
      : view === 'week'
        ? 'Contrasta la carga de la semana sin salir del centro de agendamiento.'
        : 'Consulta el mes completo y abre cualquier evento desde una grilla continua.';

  return (
    <PortalPanel
      eyebrow="Agenda"
      title={title}
      description={description}
      actions={
        <Badge variant="neutral" className="px-3 py-1 text-[11px] uppercase tracking-[0.18em]">
          {totalEvents} eventos
        </Badge>
      }
    >
      {days.length === 0 ? (
        <PortalEmptyState
          title="No hay días visibles"
          description="Ajusta la fecha base para revisar horarios disponibles en esta vista."
          icon={CalendarX2}
        />
      ) : view === 'month' ? (
        <div className="space-y-3">
          <div className="grid grid-cols-7 gap-2">
            {weekdayLabels.map((label) => (
              <div
                key={label}
                className="rounded-2xl border border-transparent px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
            {days.map((day, index) => (
              <section
                key={day.key}
                className="min-h-[180px] rounded-2xl border border-gray-200 bg-white p-3 dark:border-dark-border dark:bg-dark-surface-2"
                style={
                  index === 0 ? { gridColumnStart: getMonthGridOffset(day.date) + 1 } : undefined
                }
                aria-label={day.label}
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {day.date.getDate()}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{day.shortLabel}</p>
                  </div>
                  <Badge variant="neutral">{day.events.length}</Badge>
                </div>

                {day.events.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400">Sin eventos</p>
                ) : (
                  <div className="space-y-2">
                    {day.events.slice(0, 3).map((event) => {
                      const technician = techniciansById.get(event.assignedUserId);

                      return (
                        <ScheduleEventCard
                          key={event.id}
                          event={event}
                          technician={technician ?? null}
                          variant="compact"
                          onSelect={onSelectEvent}
                        />
                      );
                    })}
                    {day.events.length > 3 && (
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        +{day.events.length - 3} eventos adicionales
                      </p>
                    )}
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>
      ) : (
        <div
          className={`grid gap-4 ${view === 'day' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-7'}`}
        >
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
                        variant={view === 'day' ? 'calendar' : 'compact'}
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
