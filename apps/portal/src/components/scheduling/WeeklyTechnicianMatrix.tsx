'use client';

import { CalendarRange } from 'lucide-react';
import { cn } from '@iwana/ui';
import type {
  InternalUser,
  WfmScheduleEvent,
  WfmScheduleRecommendation,
  WfmTechnicianAvailability,
} from '@/lib/api-client';
import { PortalEmptyState, PortalPanel } from '@/components/shared/portal-ui';
import {
  formatShortWfmDayLabel,
  formatWfmTime,
  getTechnicianAvailabilityLabel,
  getTechnicianDisplayName,
  getTechnicianSubtitle,
} from './scheduling-ui';

interface WeeklyTechnicianMatrixProps {
  technicians: InternalUser[];
  events: WfmScheduleEvent[];
  availability: WfmTechnicianAvailability[];
  rangeStart: Date;
  recommendations: WfmScheduleRecommendation[];
  selectedRecommendationId: string | null;
  onSelectRecommendation: (recommendationId: string) => void;
}

type MatrixDay = {
  key: string;
  label: string;
  startAt: Date;
  endAt: Date;
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildMatrixDays(rangeStart: Date): MatrixDay[] {
  const days: MatrixDay[] = [];

  for (let index = 0; index < 7; index += 1) {
    const startAt = new Date(rangeStart);
    startAt.setDate(rangeStart.getDate() + index);
    startAt.setHours(0, 0, 0, 0);
    const endAt = new Date(startAt);
    endAt.setHours(23, 59, 59, 999);

    days.push({
      key: toDayKey(startAt),
      label: formatShortWfmDayLabel(startAt),
      startAt,
      endAt,
    });
  }

  return days;
}

function overlaps(startAt: Date, endAt: Date, otherStartAt: Date, otherEndAt: Date): boolean {
  return otherStartAt.getTime() < endAt.getTime() && otherEndAt.getTime() > startAt.getTime();
}

function getRecommendationKey(recommendation: WfmScheduleRecommendation): string {
  return `${recommendation.technicianId}::${recommendation.scheduledStartAt}`;
}

export function WeeklyTechnicianMatrix({
  technicians,
  events,
  availability,
  rangeStart,
  recommendations,
  selectedRecommendationId,
  onSelectRecommendation,
}: WeeklyTechnicianMatrixProps) {
  const days = buildMatrixDays(rangeStart);

  if (technicians.length === 0) {
    return (
      <PortalPanel
        eyebrow="Matriz semanal"
        title="Capacidad operativa"
        description="No hay técnicos ni contratistas activos disponibles para esta vista."
      >
        <PortalEmptyState
          title="Sin personal elegible"
          description="La bandeja necesita al menos un técnico o contratista activo para mostrar recomendaciones y capacidad semanal."
          icon={CalendarRange}
        />
      </PortalPanel>
    );
  }

  return (
    <PortalPanel
      eyebrow="Matriz semanal"
      title="Capacidad por técnico"
      description="Vista densa de siete días para contrastar carga, bloqueos y la franja recomendada antes de confirmar agenda."
      className="h-full"
      contentClassName="overflow-hidden"
    >
      <div className="overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 min-w-[220px] border-b border-gray-200 bg-white px-4 py-3 text-left align-middle text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-400">
                Técnico
              </th>
              {days.map((day) => (
                <th
                  key={day.key}
                  className="sticky top-0 z-10 min-w-[156px] border-b border-gray-200 bg-white px-4 py-3 text-left align-middle text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-400"
                >
                  {day.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {technicians.map((technician) => (
              <tr key={technician.id}>
                <td className="sticky left-0 z-10 border-b border-gray-100 bg-white px-4 py-4 align-middle dark:border-dark-border dark:bg-dark-surface-2">
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {getTechnicianDisplayName(technician)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {getTechnicianSubtitle(technician)}
                  </p>
                </td>
                {days.map((day) => {
                  const dayEvents = events.filter(
                    (event) =>
                      event.assignedUserId === technician.id &&
                      overlaps(
                        day.startAt,
                        day.endAt,
                        new Date(event.scheduledStartAt),
                        new Date(event.scheduledEndAt),
                      ),
                  );
                  const dayAvailability = availability.filter(
                    (entry) =>
                      entry.userId === technician.id &&
                      overlaps(
                        day.startAt,
                        day.endAt,
                        new Date(entry.startsAt),
                        new Date(entry.endsAt),
                      ),
                  );

                  // La matriz prioriza bloqueos sobre disponibilidades explícitas para evitar falsas señales.
                  const blockedEntry = dayAvailability.find((entry) => entry.type !== 'AVAILABLE');
                  const availableEntry = dayAvailability.find(
                    (entry) => entry.type === 'AVAILABLE',
                  );
                  const matchingRecommendation = recommendations.find(
                    (recommendation) =>
                      recommendation.technicianId === technician.id &&
                      toDayKey(new Date(recommendation.scheduledStartAt)) === day.key,
                  );
                  const recommendationKey = matchingRecommendation
                    ? getRecommendationKey(matchingRecommendation)
                    : null;
                  const recommendationMatches = recommendationKey === selectedRecommendationId;

                  return (
                    <td
                      key={`${technician.id}-${day.key}`}
                      className={cn(
                        'border-b border-l border-gray-100 px-4 py-4 align-middle dark:border-dark-border',
                        recommendationMatches && 'bg-emerald-50/80 dark:bg-emerald-950/20',
                      )}
                    >
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {dayEvents.length > 0
                            ? `${dayEvents.length} evento${dayEvents.length === 1 ? '' : 's'}`
                            : 'Sin eventos'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {blockedEntry
                            ? getTechnicianAvailabilityLabel(blockedEntry.type)
                            : availableEntry
                              ? getTechnicianAvailabilityLabel(availableEntry.type)
                              : 'Sin disponibilidad explícita'}
                        </p>
                        {matchingRecommendation && (
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200">
                            <p>
                              Recomendado: {formatWfmTime(matchingRecommendation.scheduledStartAt)}{' '}
                              - {formatWfmTime(matchingRecommendation.scheduledEndAt)}
                            </p>
                            <button
                              type="button"
                              className="mt-2 rounded-lg bg-iwana-primary px-2 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-iwana-primary-800 focus:outline-none focus:ring-2 focus:ring-iwana-primary focus:ring-offset-2 dark:focus:ring-offset-dark-surface-2"
                              onClick={() => {
                                if (recommendationKey) {
                                  onSelectRecommendation(recommendationKey);
                                }
                              }}
                            >
                              Usar esta franja
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PortalPanel>
  );
}
