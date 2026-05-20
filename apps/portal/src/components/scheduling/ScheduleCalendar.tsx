'use client';

import { CalendarX2, Clock3, MapPin, UserRound } from 'lucide-react';
import { Badge } from '@iwana/ui';
import type { InternalUser, WfmScheduleEvent } from '@/lib/api-client';
import { PortalEmptyState, PortalPanel } from '@/components/shared/portal-ui';
import {
  type SchedulingCalendarDay,
  getScheduleEventStatusLabel,
  getScheduleEventStatusVariant,
  getTechnicianDisplayName,
  getWfmWorkTypeLabel,
  getWfmWorkTypeVariant,
  formatWfmDateRange,
} from './scheduling-ui';

interface ScheduleCalendarProps {
  days: SchedulingCalendarDay[];
  techniciansById: Map<string, InternalUser>;
  onSelectEvent: (event: WfmScheduleEvent) => void;
}

export function ScheduleCalendar({ days, techniciansById, onSelectEvent }: ScheduleCalendarProps) {
  const totalEvents = days.reduce((total, day) => total + day.events.length, 0);

  return (
    <PortalPanel
      eyebrow="Vista calendario"
      title="Franja operativa"
      description="Consulta la agenda agrupada por día sin salir del portal empresarial."
      actions={
        <Badge variant="neutral" className="px-3 py-1 text-[11px] uppercase tracking-[0.18em]">
          {totalEvents} eventos
        </Badge>
      }
    >
      {days.length === 0 ? (
        <PortalEmptyState
          title="No hay días visibles"
          description="Ajusta el rango de fechas para abrir una ventana operativa válida."
          icon={CalendarX2}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          {days.map((day) => (
            <section
              key={day.key}
              className="rounded-2xl border border-gray-200 bg-[#fbfcf8] p-4 dark:border-dark-border dark:bg-dark-surface-3"
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
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => onSelectEvent(event)}
                        className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-iwana-primary/30 hover:bg-iwana-primary-50/40 dark:border-dark-border dark:bg-dark-surface-2 dark:hover:border-iwana-primary-300/40 dark:hover:bg-dark-surface-2"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white">
                              {event.title}
                            </p>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                              {formatWfmDateRange(event.scheduledStartAt, event.scheduledEndAt)}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={getWfmWorkTypeVariant(event.type)}>
                              {getWfmWorkTypeLabel(event.type)}
                            </Badge>
                            <Badge variant={getScheduleEventStatusVariant(event.status)}>
                              {getScheduleEventStatusLabel(event.status)}
                            </Badge>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-2 text-xs text-gray-500 dark:text-gray-400">
                          <p className="flex items-center gap-2">
                            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                            {formatWfmDateRange(event.scheduledStartAt, event.scheduledEndAt)}
                          </p>
                          <p className="flex items-center gap-2">
                            <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                            {technician
                              ? getTechnicianDisplayName(technician)
                              : 'Técnico no disponible'}
                          </p>
                          <p className="flex items-center gap-2">
                            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                            {[event.address, event.sector, event.municipality]
                              .filter(Boolean)
                              .join(' · ') || 'Ubicación no disponible'}
                          </p>
                        </div>
                      </button>
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
