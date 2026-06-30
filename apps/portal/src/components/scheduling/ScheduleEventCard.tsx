'use client';

import { Clock3, MapPin, UserRound } from 'lucide-react';
import { Badge } from '@iwana/ui';
import type { InternalUser, WfmScheduleEvent } from '@/lib/api-client';
import {
  formatWfmDateRange,
  formatWfmTime,
  getScheduleEventStatusLabel,
  getScheduleEventStatusVariant,
  getTechnicianDisplayName,
  getWfmWorkTypeLabel,
  getWfmWorkTypeVariant,
} from './scheduling-ui';

interface ScheduleEventCardProps {
  event: WfmScheduleEvent;
  technician?: InternalUser | null;
  variant: 'calendar' | 'timeline' | 'compact';
  onSelect: (event: WfmScheduleEvent) => void;
}

export function ScheduleEventCard({
  event,
  technician,
  variant,
  onSelect,
}: ScheduleEventCardProps) {
  const isTimeline = variant === 'timeline';
  const isCompact = variant === 'compact';
  const rangeLabel = isTimeline
    ? `${formatWfmTime(event.scheduledStartAt)} - ${formatWfmTime(event.scheduledEndAt)}`
    : formatWfmDateRange(event.scheduledStartAt, event.scheduledEndAt);

  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      aria-label={`Evento ${event.title} ${rangeLabel}`}
      className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-iwana-primary/30 hover:bg-iwana-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2 dark:border-dark-border dark:bg-dark-surface-2 dark:hover:border-iwana-primary-300/40 dark:focus-visible:ring-offset-dark-surface-2"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 dark:text-white">{event.title}</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{rangeLabel}</p>
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

      {!isCompact && (
        <div className="mt-3 grid gap-2 text-xs text-gray-500 dark:text-gray-400">
          {!isTimeline && (
            <p className="flex items-center gap-2">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              {formatWfmDateRange(event.scheduledStartAt, event.scheduledEndAt)}
            </p>
          )}
          <p className="flex items-center gap-2">
            <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
            {technician ? getTechnicianDisplayName(technician) : 'Responsable no disponible'}
          </p>
          <p className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            {[event.address, event.sector, event.municipality].filter(Boolean).join(' · ') ||
              'Ubicación no disponible'}
          </p>
        </div>
      )}
    </button>
  );
}
