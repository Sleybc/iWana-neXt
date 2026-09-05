'use client';

import { useMemo } from 'react';
import type { InternalUser, WfmScheduleEvent } from '@/lib/api-client';
import type { SchedulingFilters } from './scheduling-ui';
import { buildCalendarDays, buildTechnicianOptions } from './scheduling-ui';

interface UseSchedulingDerivedStateParams {
  technicians: InternalUser[];
  events: WfmScheduleEvent[];
  filters: SchedulingFilters;
  selectedEvent: WfmScheduleEvent | null;
}

export function useSchedulingDerivedState({
  technicians,
  events,
  filters,
  selectedEvent,
}: UseSchedulingDerivedStateParams) {
  const safeTechnicians = Array.isArray(technicians) ? technicians : [];

  const techniciansById = useMemo(
    () => new Map(safeTechnicians.map((technician) => [technician.id, technician])),
    [safeTechnicians],
  );

  const assigneeOptions = useMemo(() => buildTechnicianOptions(safeTechnicians), [safeTechnicians]);

  const calendarDays = useMemo(
    () => buildCalendarDays(events, filters),
    [events, filters.fromDate, filters.toDate],
  );

  const selectedTechnician = selectedEvent
    ? (techniciansById.get(selectedEvent.assignedUserId) ?? null)
    : null;

  return {
    techniciansById,
    assigneeOptions,
    calendarDays,
    selectedTechnician,
  };
}
