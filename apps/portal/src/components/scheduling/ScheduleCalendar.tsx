'use client';

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { CalendarX2, Check, X } from 'lucide-react';
import { Badge, Button } from '@iwana/ui';
import { ScheduleEventStatus } from '@iwana/shared';
import type {
  InternalUser,
  WfmScheduleEvent,
  WfmVisitRequest,
  WfmWorkOrder,
} from '@/lib/api-client';
import { PortalEmptyState, PortalPanel } from '@/components/shared/portal-ui';
import { filterActionablePendingVisitRequests } from './pending-visits-ui';
import type { SchedulingCalendarDay, SchedulingView } from './scheduling-ui';
import {
  formatWfmDayLabel,
  formatWfmTime,
  getEventReferenceLabel,
  getScheduleEventStatusLabel,
  getTechnicianDisplayName,
  HIGH_DENSITY_DAY_THRESHOLD,
} from './scheduling-ui';
import { PendingVisitRailCard } from './PendingVisitRailCard';
import {
  DailyTimelineHoverHint,
  formatTimelineReferenceLabel,
  type DailyTimelineHoverDetails,
} from './DailyTimelineHoverHint';
import {
  buildDisplayWindowFromOperatingWindow,
  buildHalfHourSlotsForDisplayWindow,
  buildHourLabelsForDisplayWindow,
  getTimelineMinutesRangeForDisplayWindow,
  moveDailyDraftToTime,
  PENDING_VISIT_DRAG_MIME,
  parsePendingVisitDragPayload,
  resizeDailyDraftEnd,
  resizeDailyDraftStart,
  snapMinutesToHalfHour,
  type DailyDraftEvent,
  type DailyDisplayWindow,
  type PendingVisitDragPayload,
} from './daily-schedule-draft';
import { isScheduleDaySlotInPast } from './schedule-event-time';

interface ScheduleCalendarProps {
  days: SchedulingCalendarDay[];
  technicians: InternalUser[];
  techniciansById: Map<string, InternalUser>;
  workOrdersById?: Map<string, WfmWorkOrder> | undefined;
  view: Exclude<SchedulingView, 'list'>;
  pendingVisitRequests?: WfmVisitRequest[] | undefined;
  selectedPendingVisitRequestId?: string | null | undefined;
  pendingAsideContent?: ReactNode;
  displayWindow?: DailyDisplayWindow | undefined;
  dailyDraft?: DailyDraftEvent | null | undefined;
  onSelectEvent: (event: WfmScheduleEvent) => void;
  onSelectPendingVisit?: ((visitRequestId: string) => void) | undefined;
  onOpenPendingVisitsInbox?: (() => void) | undefined;
  onCreateEventSlot?: ((selection: ScheduleCalendarSlotSelection) => void) | undefined;
  onPendingVisitDrop?: ((payload: PendingVisitDropPayload) => void) | undefined;
  onDailyDraftChange?: ((draft: DailyDraftEvent) => void) | undefined;
  onDailyDraftConfirm?: (() => void) | undefined;
  onDailyDraftDiscard?: (() => void) | undefined;
  onOpenDay?: ((dayKey: string) => void) | undefined;
}

export interface PendingVisitDropPayload extends PendingVisitDragPayload {
  assignedUserId: string;
  dayKey: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
}

export interface ScheduleCalendarSlotSelection {
  assignedUserId: string;
  dayKey: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
}

const weekdayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DEFAULT_SLOT_DURATION_MINUTES = 60;
const DEFAULT_DISPLAY_WINDOW = buildDisplayWindowFromOperatingWindow(null);

function buildSlotSelection(
  dayKey: string,
  assignedUserId: string,
  timeValue: string,
  durationMinutes = DEFAULT_SLOT_DURATION_MINUTES,
) {
  const [hourPart = '00', minutePart = '00'] = timeValue.split(':');
  const startAt = new Date(`${dayKey}T${hourPart}:${minutePart}:00`);
  const endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000);

  return {
    assignedUserId,
    dayKey,
    scheduledStartAt: startAt.toISOString(),
    scheduledEndAt: endAt.toISOString(),
  } satisfies ScheduleCalendarSlotSelection;
}

function getMonthGridOffset(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function getDraftValidationMessage(validationState: DailyDraftEvent['validationState']): string {
  switch (validationState) {
    case 'out-of-window':
      return 'Fuera de ventana operativa';
    case 'conflict':
      return 'Cruce con otra agenda';
    case 'in-the-past':
      return 'La franja ya pasó';
    case 'incomplete':
      return 'Borrador incompleto';
    default:
      return 'Listo para confirmar';
  }
}

function getTechnicianInitials(
  technician: Pick<InternalUser, 'firstName' | 'lastName' | 'email'>,
): string {
  const initials = [technician.firstName?.[0], technician.lastName?.[0]]
    .filter(Boolean)
    .join('')
    .toUpperCase();

  if (initials) {
    return initials;
  }

  return technician.email.slice(0, 2).toUpperCase();
}

type DailyPositionedEvent = {
  event: WfmScheduleEvent;
  left: number;
  width: number;
  lane: number;
};

const DAILY_TIMELINE_BLOCK_HEIGHT = 52;
const DAILY_TIMELINE_BLOCK_TOP = 8;
const DAILY_TIMELINE_LANE_GAP = 6;
const DAILY_TIMELINE_LANE_STEP = DAILY_TIMELINE_BLOCK_HEIGHT + DAILY_TIMELINE_LANE_GAP;
const DAILY_TIMELINE_ROW_PADDING = 4;

function getDailyTimelineRowHeight(laneCount: number): number {
  return (
    DAILY_TIMELINE_BLOCK_TOP + laneCount * DAILY_TIMELINE_LANE_STEP + DAILY_TIMELINE_ROW_PADDING
  );
}

function getDailyEventBlockTop(lane: number): number {
  return DAILY_TIMELINE_BLOCK_TOP + lane * DAILY_TIMELINE_LANE_STEP;
}

function getDailyLaneDividerTop(laneIndex: number): number {
  return (
    DAILY_TIMELINE_BLOCK_TOP + (laneIndex + 1) * DAILY_TIMELINE_LANE_STEP - DAILY_TIMELINE_LANE_GAP
  );
}

function DailyTimelineBlockBody({
  timeRange,
  title,
  details,
  hintHidden = false,
}: {
  timeRange: string;
  title: string;
  details: DailyTimelineHoverDetails;
  hintHidden?: boolean;
}) {
  return (
    <DailyTimelineHoverHint details={details} hidden={hintHidden}>
      <div className="flex h-full min-w-0 flex-col justify-center gap-0.5 px-3 py-1">
        <p className="truncate text-[11px] font-semibold tabular-nums leading-none opacity-90">
          {timeRange}
        </p>
        <p className="truncate text-xs font-semibold leading-tight">{title}</p>
      </div>
    </DailyTimelineHoverHint>
  );
}

function buildDailyPositionedEvents(
  events: WfmScheduleEvent[],
  startMinutes: number,
  totalMinutes: number,
): { items: DailyPositionedEvent[]; laneCount: number } {
  const laneEndMinutes: number[] = [];
  const items: DailyPositionedEvent[] = [];

  events.forEach((event) => {
    const eventStart = new Date(event.scheduledStartAt);
    const eventEnd = new Date(event.scheduledEndAt);
    const eventStartMinutes = eventStart.getHours() * 60 + eventStart.getMinutes();
    const eventEndMinutes = eventEnd.getHours() * 60 + eventEnd.getMinutes();
    let lane = laneEndMinutes.findIndex((laneEnd) => laneEnd <= eventStartMinutes);

    if (lane === -1) {
      lane = laneEndMinutes.length;
      laneEndMinutes.push(eventEndMinutes);
    } else {
      laneEndMinutes[lane] = eventEndMinutes;
    }

    items.push({
      event,
      lane,
      left: Math.max(0, ((eventStartMinutes - startMinutes) / totalMinutes) * 100),
      width: Math.max(7, ((eventEndMinutes - eventStartMinutes) / totalMinutes) * 100),
    });
  });

  return {
    items,
    laneCount: Math.max(laneEndMinutes.length, 1),
  };
}

function getDayEventBlockClass(status: ScheduleEventStatus): string {
  switch (status) {
    case ScheduleEventStatus.EN_ROUTE:
      return 'border-sky-200 bg-sky-100 text-sky-900 dark:border-sky-400/35 dark:bg-sky-500/15 dark:text-sky-100';
    case ScheduleEventStatus.IN_PROGRESS:
      return 'border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-400/35 dark:bg-amber-500/15 dark:text-amber-100';
    case ScheduleEventStatus.COMPLETED:
      return 'border-emerald-200 bg-emerald-100 text-emerald-900 dark:border-emerald-400/35 dark:bg-emerald-500/15 dark:text-emerald-100';
    case ScheduleEventStatus.CANCELLED:
    case ScheduleEventStatus.NO_SHOW:
      return 'border-rose-200 bg-rose-100 text-rose-900 dark:border-rose-400/35 dark:bg-rose-500/15 dark:text-rose-100';
    case ScheduleEventStatus.RESCHEDULED:
      return 'border-lime-200 bg-lime-100 text-lime-900 dark:border-lime-400/35 dark:bg-lime-500/15 dark:text-lime-100';
    default:
      return 'border-iwana-primary/15 bg-iwana-primary text-white dark:border-iwana-primary-200/40 dark:bg-iwana-primary-700';
  }
}

function buildDailyTechnicianRows(
  technicians: InternalUser[],
  days: SchedulingCalendarDay[],
): Array<{ technician: InternalUser; events: WfmScheduleEvent[] }> {
  const dayEvents = days[0]?.events ?? [];

  return technicians.map((technician) => ({
    technician,
    events: dayEvents
      .filter((event) => event.assignedUserId === technician.id)
      .sort(
        (left, right) =>
          new Date(left.scheduledStartAt).getTime() - new Date(right.scheduledStartAt).getTime(),
      ),
  }));
}

function chunkMonthDays(days: SchedulingCalendarDay[]): Array<Array<SchedulingCalendarDay | null>> {
  const firstDay = days[0];

  if (!firstDay) {
    return [];
  }

  const offset = getMonthGridOffset(firstDay.date);
  const cells: Array<SchedulingCalendarDay | null> = [
    ...Array.from({ length: offset }, () => null),
    ...days,
  ];

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const weeks: Array<Array<SchedulingCalendarDay | null>> = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  return weeks;
}

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function getDayAssignedCount(day: SchedulingCalendarDay): number {
  return new Set(day.events.map((event) => event.assignedUserId).filter(Boolean)).size;
}

function getDayUnassignedCount(day: SchedulingCalendarDay): number {
  return day.events.filter((event) => !event.assignedUserId).length;
}

function getDayTimeCoverageLabel(day: SchedulingCalendarDay): string {
  if (day.events.length === 0) {
    return 'Sin franja';
  }

  const ordered = [...day.events].sort(
    (left, right) =>
      new Date(left.scheduledStartAt).getTime() - new Date(right.scheduledStartAt).getTime(),
  );
  const firstEvent = ordered[0];
  const lastEvent = ordered[ordered.length - 1];

  if (!firstEvent || !lastEvent) {
    return 'Sin franja';
  }

  return `${formatWfmTime(firstEvent.scheduledStartAt)} - ${formatWfmTime(lastEvent.scheduledEndAt)}`;
}

function getOperationalLoadVariant(eventCount: number): 'neutral' | 'info' | 'warning' | 'error' {
  if (eventCount >= HIGH_DENSITY_DAY_THRESHOLD) {
    return 'error';
  }
  if (eventCount >= 12) {
    return 'warning';
  }
  if (eventCount >= 1) {
    return 'info';
  }
  return 'neutral';
}

function getWeekDayOperationalLabel(eventCount: number): string {
  if (eventCount >= HIGH_DENSITY_DAY_THRESHOLD) {
    return 'Alta densidad';
  }
  if (eventCount >= 12) {
    return 'Presión alta';
  }
  if (eventCount >= 6) {
    return 'Carga estable';
  }
  if (eventCount >= 1) {
    return 'Capacidad disponible';
  }
  return 'Hueco disponible';
}

function getWeekDayOperationalCopy(eventCount: number): string {
  if (eventCount >= HIGH_DENSITY_DAY_THRESHOLD) {
    return 'Conviene bajar a la vista diaria para ordenar secuencia, resolver cruces y cerrar huecos.';
  }
  if (eventCount >= 12) {
    return 'La jornada exige seguimiento cercano. Revisa responsables, huecos y bloqueos antes de despachar.';
  }
  if (eventCount >= 6) {
    return 'La carga está repartida y todavía es legible como tablero de capacidad semanal.';
  }
  if (eventCount >= 1) {
    return 'Aún hay margen para incorporar tareas o reagendar sin perder control de la jornada.';
  }
  return 'La fecha está libre para sumar visitas, mantenimientos o reprogramaciones.';
}

function getMonthDayCountVariant(
  day: SchedulingCalendarDay,
): 'neutral' | 'info' | 'warning' | 'error' {
  return getOperationalLoadVariant(day.events.length);
}

function getMonthDayMeterClassName(day: SchedulingCalendarDay): string {
  if (day.events.length >= HIGH_DENSITY_DAY_THRESHOLD) {
    return 'bg-rose-500 dark:bg-rose-400';
  }
  if (day.events.length >= 12) {
    return 'bg-amber-500 dark:bg-amber-400';
  }
  if (day.events.length >= 6) {
    return 'bg-sky-500 dark:bg-sky-400';
  }
  if (day.events.length >= 1) {
    return 'bg-emerald-500 dark:bg-emerald-400';
  }
  return 'bg-gray-300 dark:bg-gray-600';
}

function getMonthDayMeterWidth(day: SchedulingCalendarDay): string {
  if (day.events.length === 0) {
    return '0%';
  }

  const ratio = Math.min(day.events.length / HIGH_DENSITY_DAY_THRESHOLD, 1);
  return `${Math.max(18, Math.round(ratio * 100))}%`;
}

function getMonthDaySurfaceClassName(day: SchedulingCalendarDay, today: Date): string {
  const isToday = isSameLocalDay(day.date, today);
  const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;

  if (isToday) {
    return 'bg-iwana-primary-50 dark:bg-iwana-primary-900/15';
  }

  if (day.events.length >= HIGH_DENSITY_DAY_THRESHOLD) {
    return 'bg-rose-50/80 dark:bg-rose-500/10';
  }

  if (day.events.length >= 12) {
    return 'bg-amber-50/70 dark:bg-amber-500/8';
  }

  if (day.events.length >= 6) {
    return 'bg-sky-50/80 dark:bg-sky-500/8';
  }

  if (day.events.length === 0 && isWeekend) {
    return 'bg-iwana-surface-soft dark:bg-dark-surface-3/80';
  }

  return 'bg-white dark:bg-dark-surface-2';
}

function getMonthDayOperationalLabel(day: SchedulingCalendarDay, today: Date): string {
  const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;
  const isPast =
    day.date.getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  if (day.events.length >= HIGH_DENSITY_DAY_THRESHOLD) {
    return 'Alta densidad';
  }
  if (day.events.length >= 12) {
    return 'Jornada exigente';
  }
  if (day.events.length >= 6) {
    return 'Carga activa';
  }
  if (day.events.length >= 1) {
    return 'Carga ligera';
  }
  if (isWeekend) {
    return 'Fin de semana';
  }
  if (isPast) {
    return 'Sin carga registrada';
  }
  return 'Disponible';
}

function getMonthDayNumberClassName(day: SchedulingCalendarDay, today: Date): string {
  return isSameLocalDay(day.date, today)
    ? 'bg-iwana-primary text-white shadow-sm dark:bg-iwana-primary-400 dark:text-iwana-primary-950'
    : 'bg-iwana-surface-soft text-gray-900 hover:bg-iwana-primary-50 dark:bg-dark-surface-3 dark:text-white dark:hover:bg-dark-surface-4';
}

function MonthAgenda({ days, onOpenDay }: Pick<ScheduleCalendarProps, 'days' | 'onOpenDay'>) {
  const weeks = useMemo(() => chunkMonthDays(days), [days]);
  const today = useMemo(() => new Date(), []);
  const scheduledDays = days.filter((day) => day.events.length > 0).length;
  const freeDays = days.filter((day) => day.events.length === 0).length;
  const demandingDays = days.filter((day) => day.events.length >= 12).length;
  const highDensityDays = days.filter(
    (day) => day.events.length >= HIGH_DENSITY_DAY_THRESHOLD,
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="primary">{scheduledDays} días con agenda</Badge>
        <Badge variant="lime">{freeDays} días despejados</Badge>
        <Badge variant={demandingDays > 0 ? 'warning' : 'neutral'}>
          {demandingDays} jornadas exigentes
        </Badge>
        <Badge variant={highDensityDays > 0 ? 'error' : 'neutral'}>
          {highDensityDays} días de alta densidad
        </Badge>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full table-fixed border-separate border-spacing-0">
          <thead>
            <tr>
              {weekdayLabels.map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="border-b border-gray-100 px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-iwana-secondary-700 dark:border-dark-border dark:text-iwana-secondary-400"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, weekIndex) => (
              <tr key={`week-${weekIndex}`}>
                {week.map((day, dayIndex) => (
                  <td key={day?.key ?? `empty-${weekIndex}-${dayIndex}`} className="align-top">
                    {day ? (
                      <section
                        aria-label={day.label}
                        className={`flex min-h-[228px] flex-col border-b border-r border-gray-100 px-3 py-3 dark:border-dark-border ${dayIndex === 0 ? 'border-l' : ''} ${getMonthDaySurfaceClassName(day, today)}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            {onOpenDay ? (
                              <button
                                type="button"
                                onClick={() => onOpenDay(day.key)}
                                className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full px-3 text-sm font-semibold transition-colors ${getMonthDayNumberClassName(day, today)}`}
                                aria-label={`Abrir el detalle del ${day.label}`}
                              >
                                {day.date.getDate()}
                              </button>
                            ) : (
                              <span
                                className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full px-3 text-sm font-semibold ${getMonthDayNumberClassName(day, today)}`}
                              >
                                {day.date.getDate()}
                              </span>
                            )}
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                              {day.shortLabel}
                            </p>
                          </div>
                          <Badge variant={getMonthDayCountVariant(day)}>{day.events.length}</Badge>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                            {getMonthDayOperationalLabel(day, today)}
                          </p>
                          {onOpenDay && (
                            <button
                              type="button"
                              onClick={() => onOpenDay(day.key)}
                              aria-label={`Abrir día ${day.label}`}
                              className="text-xs font-medium text-iwana-primary underline-offset-4 hover:underline dark:text-iwana-primary-300"
                            >
                              Abrir día
                            </button>
                          )}
                        </div>

                        <div className="mt-3">
                          <div
                            className="h-2 rounded-full bg-gray-200/80 dark:bg-dark-surface-4"
                            aria-hidden="true"
                          >
                            <div
                              className={`h-full rounded-full ${getMonthDayMeterClassName(day)}`}
                              style={{ width: getMonthDayMeterWidth(day) }}
                            />
                          </div>
                        </div>

                        {day.events.length === 0 ? (
                          <div className="mt-4 rounded-2xl border border-dashed border-gray-200 bg-iwana-surface-soft/80 px-3 py-3 text-xs text-gray-500 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-400">
                            {day.date.getDay() === 0 || day.date.getDay() === 6
                              ? 'Sin carga activa en esta fecha.'
                              : 'La jornada mantiene espacio para sumar tareas o resolver reprogramaciones.'}
                          </div>
                        ) : (
                          <div className="mt-4 grid gap-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="rounded-xl bg-iwana-surface-soft/90 px-3 py-2 dark:bg-dark-surface-3/90">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                                  Responsables
                                </p>
                                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                                  {getDayAssignedCount(day)}
                                </p>
                              </div>
                              <div className="rounded-xl bg-iwana-surface-soft/90 px-3 py-2 dark:bg-dark-surface-3/90">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                                  Ventana operativa
                                </p>
                                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                                  {getDayTimeCoverageLabel(day)}
                                </p>
                              </div>
                            </div>

                            <p className="text-xs text-gray-600 dark:text-gray-300">
                              {getDayUnassignedCount(day) > 0
                                ? `${getDayUnassignedCount(day)} tarea${getDayUnassignedCount(day) === 1 ? '' : 's'} por asignar en esta fecha.`
                                : 'La carga se lee por conteo, cobertura y presión del día.'}
                            </p>
                          </div>
                        )}
                      </section>
                    ) : (
                      <div
                        aria-hidden="true"
                        className={`min-h-[228px] border-b border-r border-gray-100 bg-transparent dark:border-dark-border ${dayIndex === 0 ? 'border-l' : ''}`}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WeekAgenda({ days, onOpenDay }: Pick<ScheduleCalendarProps, 'days' | 'onOpenDay'>) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {days.map((day) => {
        const assignedCount = getDayAssignedCount(day);
        const unassignedCount = getDayUnassignedCount(day);
        const eventCount = day.events.length;

        return (
          <section
            key={day.key}
            className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-border dark:bg-dark-surface-2"
            aria-label={day.label}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
                  {day.shortLabel}
                </p>
                <p className="mt-1 text-base font-semibold text-gray-900 dark:text-white">
                  {day.label}
                </p>
              </div>
              <Badge variant={getOperationalLoadVariant(eventCount)}>
                {eventCount} tarea{eventCount === 1 ? '' : 's'}
              </Badge>
            </div>

            <div className="mt-4 rounded-xl bg-iwana-surface-soft/90 px-3 py-3 dark:bg-dark-surface-3/90">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {getWeekDayOperationalLabel(eventCount)}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {getWeekDayOperationalCopy(eventCount)}
              </p>
            </div>

            <div className="mt-4">
              <div
                className="h-2 rounded-full bg-gray-200/80 dark:bg-dark-surface-4"
                aria-hidden="true"
              >
                <div
                  className={`h-full rounded-full ${getMonthDayMeterClassName(day)}`}
                  style={{ width: getMonthDayMeterWidth(day) }}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl bg-iwana-surface-soft/90 px-3 py-2 dark:bg-dark-surface-3/90">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                  Responsables
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                  {assignedCount}
                </p>
              </div>
              <div className="rounded-xl bg-iwana-surface-soft/90 px-3 py-2 dark:bg-dark-surface-3/90">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                  Ventana operativa
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                  {getDayTimeCoverageLabel(day)}
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {unassignedCount > 0
                  ? `${unassignedCount} tarea${unassignedCount === 1 ? '' : 's'} por asignar`
                  : eventCount === 0
                    ? 'Sin tareas pendientes'
                    : 'Listo para bajar al detalle'}
              </p>
              {onOpenDay && (
                <button
                  type="button"
                  onClick={() => onOpenDay(day.key)}
                  aria-label={`Abrir día ${day.label}`}
                  className="text-sm font-semibold text-iwana-primary underline-offset-4 hover:underline dark:text-iwana-primary-300"
                >
                  Abrir día
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function PendingVisitsRail({
  pendingVisitRequests,
  selectedPendingVisitRequestId,
  pendingAsideContent,
  onSelectPendingVisit,
  onOpenPendingVisitsInbox,
}: Pick<
  ScheduleCalendarProps,
  | 'pendingVisitRequests'
  | 'selectedPendingVisitRequestId'
  | 'pendingAsideContent'
  | 'onSelectPendingVisit'
  | 'onOpenPendingVisitsInbox'
>) {
  if (pendingAsideContent) {
    return (
      <aside className="flex h-full min-h-[520px] flex-col border-b border-gray-200 bg-iwana-surface-soft/45 dark:border-dark-border dark:bg-dark-surface-3/50 xl:border-b-0 xl:border-r">
        {pendingAsideContent}
      </aside>
    );
  }

  const visibleVisits = filterActionablePendingVisitRequests(pendingVisitRequests).slice(0, 6);

  return (
    <aside className="flex h-full min-h-[520px] flex-col border-b border-gray-200 bg-iwana-surface-soft/45 dark:border-dark-border dark:bg-dark-surface-3/50 xl:border-b-0 xl:border-r">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-dark-border">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          Pendientes por programar
        </h3>
        <Badge variant="neutral">{visibleVisits.length}</Badge>
      </div>

      {visibleVisits.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-5 py-6">
          <div className="max-w-[240px] text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-iwana-primary shadow-sm dark:bg-dark-surface-2">
              <CalendarX2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="mt-4 text-sm font-semibold text-gray-900 dark:text-white">
              Sin pendientes inmediatos
            </p>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Cuando entren nuevas solicitudes aparecerán aquí para despacharlas.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
          {visibleVisits.map((visitRequest) => (
            <PendingVisitRailCard
              key={visitRequest.id}
              visitRequest={visitRequest}
              isSelected={visitRequest.id === selectedPendingVisitRequestId}
              {...(onSelectPendingVisit
                ? { onClick: () => onSelectPendingVisit(visitRequest.id) }
                : {})}
            />
          ))}
        </div>
      )}

      <div className="border-t border-gray-200 px-4 py-4 dark:border-dark-border">
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={onOpenPendingVisitsInbox}
        >
          Ver bandeja completa
        </Button>
      </div>
    </aside>
  );
}

function resolveSlotFromPointer(
  clientX: number,
  clientY: number,
  startMinutes: number,
  totalMinutes: number,
): { technicianId: string; timeValue: string } | null {
  const target = document.elementFromPoint(clientX, clientY);
  const timeline = target?.closest('[data-schedule-timeline]') as HTMLElement | null;

  if (!timeline) {
    return null;
  }

  const technicianId = timeline.dataset.technicianId;
  if (!technicianId) {
    return null;
  }

  const bounds = timeline.getBoundingClientRect();
  if (bounds.width <= 0) {
    return null;
  }

  const ratio = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width));
  const rawMinutes = startMinutes + ratio * totalMinutes;
  const snappedMinutes = snapMinutesToHalfHour(rawMinutes);
  const hours = Math.floor(snappedMinutes / 60);
  const minutes = snappedMinutes % 60;

  return {
    technicianId,
    timeValue: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
  };
}

function DailyDraftBlock({
  draft,
  startMinutes,
  totalMinutes,
  onDailyDraftChange,
  onDailyDraftConfirm,
  onDailyDraftDiscard,
}: {
  draft: DailyDraftEvent;
  startMinutes: number;
  totalMinutes: number;
  onDailyDraftChange?: ((nextDraft: DailyDraftEvent) => void) | undefined;
  onDailyDraftConfirm?: (() => void) | undefined;
  onDailyDraftDiscard?: (() => void) | undefined;
}) {
  const draftRef = useRef(draft);
  const gestureCleanupRef = useRef<(() => void) | null>(null);
  const [interaction, setInteraction] = useState<'move' | 'resize-start' | 'resize-end' | null>(
    null,
  );

  draftRef.current = draft;

  const draftStart = new Date(draft.scheduledStartAt);
  const draftEnd = new Date(draft.scheduledEndAt);
  const draftStartMinutes = draftStart.getHours() * 60 + draftStart.getMinutes();
  const draftEndMinutes = draftEnd.getHours() * 60 + draftEnd.getMinutes();
  const left = Math.max(0, ((draftStartMinutes - startMinutes) / totalMinutes) * 100);
  const width = Math.max(12, ((draftEndMinutes - draftStartMinutes) / totalMinutes) * 100);
  const isInvalid = draft.validationState !== 'valid';
  const timeRange = `${formatWfmTime(draft.scheduledStartAt)} - ${formatWfmTime(draft.scheduledEndAt)}`;
  const draftHoverDetails: DailyTimelineHoverDetails = {
    eyebrow: 'Borrador',
    title: draft.title,
    timeRange,
    referenceLabel: draft.customerDisplayName?.trim() || null,
    hint: isInvalid ? getDraftValidationMessage(draft.validationState) : null,
  };

  const applyPointerSlot = useCallback(
    (clientX: number, clientY: number, mode: 'move' | 'resize-start' | 'resize-end') => {
      if (!onDailyDraftChange) {
        return;
      }

      const currentDraft = draftRef.current;
      const slot = resolveSlotFromPointer(clientX, clientY, startMinutes, totalMinutes);

      if (!slot) {
        return;
      }

      if (mode === 'move') {
        onDailyDraftChange(
          moveDailyDraftToTime(
            currentDraft,
            currentDraft.dayKey,
            slot.technicianId,
            slot.timeValue,
          ),
        );
        return;
      }

      if (mode === 'resize-start') {
        onDailyDraftChange(resizeDailyDraftStart(currentDraft, slot.timeValue));
        return;
      }

      onDailyDraftChange(resizeDailyDraftEnd(currentDraft, slot.timeValue));
    },
    [onDailyDraftChange, startMinutes, totalMinutes],
  );

  const handlePointerUp = useCallback(() => {
    gestureCleanupRef.current?.();
    gestureCleanupRef.current = null;
    setInteraction(null);
  }, []);

  const beginInteraction = (
    mode: 'move' | 'resize-start' | 'resize-end',
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    gestureCleanupRef.current?.();

    const onMove = (moveEvent: globalThis.PointerEvent) => {
      applyPointerSlot(moveEvent.clientX, moveEvent.clientY, mode);
    };
    const onUp = () => {
      handlePointerUp();
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    gestureCleanupRef.current = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    setInteraction(mode);
  };

  const endInteraction = () => {
    handlePointerUp();
  };

  const stopDraftAction = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
  };

  return (
    <div
      className={`absolute z-50 overflow-hidden rounded-2xl border text-left shadow-sm transition-transform ${
        isInvalid
          ? 'border-rose-400 bg-rose-100 text-rose-900 dark:border-rose-400/35 dark:bg-rose-500/15 dark:text-rose-100'
          : getDayEventBlockClass(ScheduleEventStatus.SCHEDULED)
      } ${interaction === 'move' ? 'cursor-grabbing' : ''}`}
      style={{
        left: `${left}%`,
        width: `calc(${width}% - 6px)`,
        minWidth: '108px',
        top: `${DAILY_TIMELINE_BLOCK_TOP}px`,
        height: `${DAILY_TIMELINE_BLOCK_HEIGHT}px`,
      }}
      aria-invalid={isInvalid}
      aria-label={`${draft.title}, ${formatWfmTime(draft.scheduledStartAt)} a ${formatWfmTime(draft.scheduledEndAt)}`}
    >
      <button
        type="button"
        aria-label="Ajustar inicio del borrador"
        className={`absolute bottom-1 left-0 top-1 z-30 w-3 cursor-ew-resize rounded-full border-0 focus-visible:outline-none focus-visible:ring-2 ${
          isInvalid
            ? 'bg-rose-500/30 focus-visible:ring-rose-500'
            : 'bg-white/30 focus-visible:ring-white'
        }`}
        onPointerDown={(event) => beginInteraction('resize-start', event)}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
      />

      <div
        className="relative h-full cursor-grab pr-14 active:cursor-grabbing"
        onPointerDown={(event) => beginInteraction('move', event)}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
      >
        <DailyTimelineBlockBody
          timeRange={timeRange}
          title={draft.title}
          details={draftHoverDetails}
          hintHidden={interaction !== null}
        />
      </div>

      <div
        className="absolute bottom-1 right-3 top-1 z-40 flex items-center gap-0.5"
        data-draft-action="true"
      >
        <button
          type="button"
          aria-label="Confirmar agenda"
          disabled={isInvalid || !onDailyDraftConfirm}
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-dark-surface-3 ${
            isInvalid
              ? 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500'
              : 'bg-white text-iwana-primary hover:bg-iwana-primary-50 focus-visible:ring-white'
          }`}
          onPointerDown={stopDraftAction}
          onClick={(event) => {
            event.stopPropagation();
            onDailyDraftConfirm?.();
          }}
        >
          <Check className="h-3 w-3" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Quitar borrador"
          disabled={!onDailyDraftDiscard}
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
            isInvalid
              ? 'border-rose-200 bg-white text-rose-700 hover:bg-rose-50 focus-visible:ring-rose-500 dark:border-rose-300/40 dark:bg-rose-500/10 dark:text-rose-100'
              : 'border-white/70 bg-white/15 text-white hover:bg-white/25 focus-visible:ring-white'
          }`}
          onPointerDown={stopDraftAction}
          onClick={(event) => {
            event.stopPropagation();
            onDailyDraftDiscard?.();
          }}
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      <button
        type="button"
        aria-label="Ajustar fin del borrador"
        className={`absolute bottom-1 right-0 top-1 z-30 w-3 cursor-ew-resize rounded-full border-0 focus-visible:outline-none focus-visible:ring-2 ${
          isInvalid
            ? 'bg-rose-500/30 focus-visible:ring-rose-500'
            : 'bg-white/30 focus-visible:ring-white'
        }`}
        onPointerDown={(event) => beginInteraction('resize-end', event)}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
      />
    </div>
  );
}

function DailyAgenda({
  days,
  technicians,
  workOrdersById,
  pendingVisitRequests,
  selectedPendingVisitRequestId,
  pendingAsideContent,
  displayWindow = DEFAULT_DISPLAY_WINDOW,
  dailyDraft,
  onSelectEvent,
  onSelectPendingVisit,
  onOpenPendingVisitsInbox,
  onCreateEventSlot,
  onPendingVisitDrop,
  onDailyDraftChange,
  onDailyDraftConfirm,
  onDailyDraftDiscard,
}: Pick<
  ScheduleCalendarProps,
  | 'days'
  | 'technicians'
  | 'workOrdersById'
  | 'pendingVisitRequests'
  | 'selectedPendingVisitRequestId'
  | 'pendingAsideContent'
  | 'displayWindow'
  | 'dailyDraft'
  | 'onSelectEvent'
  | 'onSelectPendingVisit'
  | 'onOpenPendingVisitsInbox'
  | 'onCreateEventSlot'
  | 'onPendingVisitDrop'
  | 'onDailyDraftChange'
  | 'onDailyDraftConfirm'
  | 'onDailyDraftDiscard'
>) {
  const selectedDay = days[0] ?? null;
  const hourLabels = useMemo(() => buildHourLabelsForDisplayWindow(displayWindow), [displayWindow]);
  const halfHourSlots = useMemo(
    () => buildHalfHourSlotsForDisplayWindow(displayWindow),
    [displayWindow],
  );
  const { startMinutes, totalMinutes } = useMemo(
    () => getTimelineMinutesRangeForDisplayWindow(displayWindow),
    [displayWindow],
  );
  const slotColumnStyle = useMemo(
    () => ({ gridTemplateColumns: `repeat(${halfHourSlots.length}, minmax(0, 1fr))` }),
    [halfHourSlots.length],
  );
  const hourColumnStyle = useMemo(
    () => ({ gridTemplateColumns: `repeat(${hourLabels.length}, minmax(0, 1fr))` }),
    [hourLabels.length],
  );
  const technicianRows = useMemo(
    () => buildDailyTechnicianRows(technicians, days),
    [days, technicians],
  );
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
  const isToday = selectedDay?.key === todayKey;
  const nowMinutesOfDay = now.getHours() * 60 + now.getMinutes();
  const nowIndicatorPosition =
    isToday && nowMinutesOfDay >= startMinutes && nowMinutesOfDay <= startMinutes + totalMinutes
      ? ((nowMinutesOfDay - startMinutes) / totalMinutes) * 100
      : null;
  const outsideWindowShade = useMemo(() => {
    if (displayWindow.isClosedDay) {
      return { before: 0, after: 0, full: true };
    }

    if (
      displayWindow.operatingStartMinutes === null ||
      displayWindow.operatingEndMinutes === null
    ) {
      return null;
    }

    return {
      before: Math.max(
        0,
        ((displayWindow.operatingStartMinutes - startMinutes) / totalMinutes) * 100,
      ),
      after: Math.max(
        0,
        ((startMinutes + totalMinutes - displayWindow.operatingEndMinutes) / totalMinutes) * 100,
      ),
      full: false,
    };
  }, [displayWindow, startMinutes, totalMinutes]);

  if (!selectedDay) {
    return (
      <PortalEmptyState
        title="No hay día activo"
        description="Selecciona una fecha válida para despachar la agenda operativa."
        icon={CalendarX2}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-sm dark:border-dark-border dark:bg-dark-surface-2">
      <div className="grid xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0 border-b border-gray-200 dark:border-dark-border xl:border-b-0 xl:border-r">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-dark-border">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
                Vista diaria
              </p>
              <h3 className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                {formatWfmDayLabel(selectedDay.date)}
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Arrastra pendientes a la grilla, ajusta el borrador y confirma cuando esté listo.
              </p>
            </div>
            <Badge variant="neutral">{selectedDay.events.length} eventos visibles</Badge>
          </div>

          {technicianRows.length === 0 ? (
            <div className="flex h-[520px] items-center justify-center px-6 py-6">
              <div className="max-w-[320px] text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-iwana-surface-soft text-iwana-primary dark:bg-dark-surface-3">
                  <CalendarX2 className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="mt-4 text-base font-semibold text-gray-900 dark:text-white">
                  No hay responsables visibles
                </p>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Esta mesa diaria prioriza recursos operativos. Ajusta el filtro de responsable
                  para revisar otra agenda.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1040px] border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-30 min-w-[168px] max-w-[168px] border-b border-gray-100 bg-white/95 px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-400">
                      Responsable
                    </th>
                    <th className="sticky top-0 z-20 border-b border-l border-gray-100 bg-white/95 px-0 py-0 dark:border-dark-border dark:bg-dark-surface-3">
                      <div className="grid" style={hourColumnStyle}>
                        {hourLabels.map((label) => (
                          <div
                            key={label}
                            className="border-l border-gray-100 px-2 py-4 text-center text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 first:border-l-0 dark:border-dark-border dark:text-gray-400"
                          >
                            {label}
                          </div>
                        ))}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {technicianRows.map(({ technician, events }) => {
                    const positioned = buildDailyPositionedEvents(
                      events,
                      startMinutes,
                      totalMinutes,
                    );
                    const laneCount = positioned.laneCount;
                    const rowDraft =
                      dailyDraft &&
                      dailyDraft.assignedUserId === technician.id &&
                      dailyDraft.dayKey === selectedDay.key
                        ? dailyDraft
                        : null;
                    const rowHeight = getDailyTimelineRowHeight(laneCount);
                    const hasConflict = laneCount > 1;

                    return (
                      <tr key={technician.id}>
                        <td className="sticky left-0 z-10 border-b border-gray-100 bg-white/95 px-3 pt-2 pb-0 align-top backdrop-blur-[2px] dark:border-dark-border dark:bg-dark-surface-2">
                          <div className="flex items-center gap-2">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-iwana-primary text-xs font-semibold text-white shadow-sm">
                              {getTechnicianInitials(technician)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                                {getTechnicianDisplayName(technician)}
                              </p>
                              <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                {events.length === 0
                                  ? 'Sin carga'
                                  : `${events.length} evento${events.length === 1 ? '' : 's'}`}
                                {hasConflict ? ' · Cruce' : ''}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="border-b border-l border-gray-100 p-0 align-top dark:border-dark-border">
                          <div
                            data-schedule-timeline
                            data-technician-id={technician.id}
                            className="relative overflow-hidden bg-white dark:bg-dark-surface-2"
                            style={{ height: `${rowHeight}px` }}
                          >
                            <div className="absolute inset-0 grid" style={slotColumnStyle}>
                              {halfHourSlots.map((timeValue, index) => {
                                const isPastSlot = isScheduleDaySlotInPast(
                                  selectedDay.key,
                                  timeValue,
                                );

                                return (
                                  <button
                                    key={`${technician.id}-${timeValue}`}
                                    type="button"
                                    disabled={
                                      isPastSlot || (!onCreateEventSlot && !onPendingVisitDrop)
                                    }
                                    className={`border-l border-gray-100 transition-colors ${
                                      index % 2 === 0
                                        ? 'bg-white dark:bg-dark-surface-2'
                                        : 'bg-gray-50/80 dark:bg-dark-surface-3/60'
                                    } ${
                                      isPastSlot
                                        ? 'cursor-not-allowed opacity-40'
                                        : 'hover:bg-iwana-primary-50 dark:hover:bg-iwana-primary-900/15'
                                    } dark:border-dark-border`}
                                    onClick={() => {
                                      if (isPastSlot) {
                                        return;
                                      }

                                      onCreateEventSlot?.(
                                        buildSlotSelection(
                                          selectedDay.key,
                                          technician.id,
                                          timeValue,
                                        ),
                                      );
                                    }}
                                    onDragOver={(event) => {
                                      if (!onPendingVisitDrop || isPastSlot) {
                                        return;
                                      }
                                      event.preventDefault();
                                      event.dataTransfer.dropEffect = 'copy';
                                    }}
                                    onDrop={(event) => {
                                      if (!onPendingVisitDrop || isPastSlot) {
                                        return;
                                      }

                                      event.preventDefault();
                                      const raw =
                                        event.dataTransfer.getData(PENDING_VISIT_DRAG_MIME);
                                      const payload = parsePendingVisitDragPayload(raw);
                                      if (!payload) {
                                        return;
                                      }

                                      const selection = buildSlotSelection(
                                        selectedDay.key,
                                        technician.id,
                                        timeValue,
                                        payload.durationMinutes,
                                      );
                                      onPendingVisitDrop({
                                        ...payload,
                                        ...selection,
                                      });
                                    }}
                                  >
                                    <span className="sr-only">
                                      Crear evento para {getTechnicianDisplayName(technician)} a las{' '}
                                      {timeValue}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>

                            {outsideWindowShade?.full ? (
                              <div
                                className="pointer-events-none absolute inset-0 z-10 bg-gray-300/25 dark:bg-gray-900/35"
                                aria-hidden="true"
                              />
                            ) : null}
                            {outsideWindowShade && !outsideWindowShade.full ? (
                              <>
                                <div
                                  className="pointer-events-none absolute inset-y-0 left-0 z-10 bg-gray-300/25 dark:bg-gray-900/35"
                                  style={{ width: `${outsideWindowShade.before}%` }}
                                  aria-hidden="true"
                                />
                                <div
                                  className="pointer-events-none absolute inset-y-0 right-0 z-10 bg-gray-300/25 dark:bg-gray-900/35"
                                  style={{ width: `${outsideWindowShade.after}%` }}
                                  aria-hidden="true"
                                />
                              </>
                            ) : null}

                            {nowIndicatorPosition !== null && (
                              <div
                                className="pointer-events-none absolute inset-y-0 z-20 border-l-2 border-rose-500"
                                style={{ left: `${nowIndicatorPosition}%` }}
                                aria-hidden="true"
                              />
                            )}

                            {laneCount > 1
                              ? Array.from({ length: laneCount - 1 }).map((_, laneIndex) => (
                                  <div
                                    key={`${technician.id}-lane-${laneIndex}`}
                                    className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-gray-200/90 dark:border-dark-border/80"
                                    style={{ top: `${getDailyLaneDividerTop(laneIndex)}px` }}
                                    aria-hidden="true"
                                  />
                                ))
                              : null}

                            {positioned.items.map(({ event, left, width, lane }) => {
                              const linkedWorkOrder = event.workOrderId
                                ? (workOrdersById?.get(event.workOrderId) ?? null)
                                : null;
                              const timeRange = `${formatWfmTime(event.scheduledStartAt)} - ${formatWfmTime(event.scheduledEndAt)}`;
                              const referenceLabel = formatTimelineReferenceLabel(
                                getEventReferenceLabel(event, linkedWorkOrder),
                              );

                              return (
                                <button
                                  key={event.id}
                                  type="button"
                                  className={`absolute z-30 overflow-hidden rounded-2xl border text-left shadow-sm transition-transform hover:-translate-y-0.5 ${getDayEventBlockClass(event.status)}`}
                                  style={{
                                    left: `${left}%`,
                                    width: `calc(${width}% - 6px)`,
                                    top: `${getDailyEventBlockTop(lane)}px`,
                                    height: `${DAILY_TIMELINE_BLOCK_HEIGHT}px`,
                                  }}
                                  onClick={() => onSelectEvent(event)}
                                  aria-label={`Evento ${event.title} de ${formatWfmTime(event.scheduledStartAt)} a ${formatWfmTime(event.scheduledEndAt)}`}
                                >
                                  <DailyTimelineBlockBody
                                    timeRange={timeRange}
                                    title={event.title}
                                    details={{
                                      eyebrow: getScheduleEventStatusLabel(event.status),
                                      title: event.title,
                                      timeRange,
                                      referenceLabel,
                                    }}
                                  />
                                </button>
                              );
                            })}

                            {rowDraft ? (
                              <DailyDraftBlock
                                draft={rowDraft}
                                startMinutes={startMinutes}
                                totalMinutes={totalMinutes}
                                onDailyDraftChange={onDailyDraftChange}
                                onDailyDraftConfirm={onDailyDraftConfirm}
                                onDailyDraftDiscard={onDailyDraftDiscard}
                              />
                            ) : null}

                            {events.length === 0 && !rowDraft && (
                              <div className="pointer-events-none absolute inset-x-0 top-2 flex px-5">
                                <p className="text-sm text-gray-400 dark:text-gray-500">
                                  Arrastra un pendiente o haz clic para crear.
                                </p>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <PendingVisitsRail
          pendingVisitRequests={pendingVisitRequests}
          selectedPendingVisitRequestId={selectedPendingVisitRequestId}
          pendingAsideContent={pendingAsideContent}
          onSelectPendingVisit={onSelectPendingVisit}
          onOpenPendingVisitsInbox={onOpenPendingVisitsInbox}
        />
      </div>
    </div>
  );
}

export function ScheduleCalendar({
  days,
  technicians,
  workOrdersById,
  view,
  pendingVisitRequests,
  selectedPendingVisitRequestId,
  pendingAsideContent,
  displayWindow,
  dailyDraft,
  onSelectEvent,
  onSelectPendingVisit,
  onOpenPendingVisitsInbox,
  onCreateEventSlot,
  onPendingVisitDrop,
  onDailyDraftChange,
  onDailyDraftConfirm,
  onDailyDraftDiscard,
  onOpenDay,
}: ScheduleCalendarProps) {
  const totalEvents = days.reduce((total, day) => total + day.events.length, 0);
  const title =
    view === 'day' ? 'Despacho diario' : view === 'week' ? 'Capacidad semanal' : 'Mapa mensual';
  const description =
    view === 'day'
      ? 'Centro operativo para asignar, abrir detalle y convertir vacíos de agenda en acción inmediata.'
      : view === 'week'
        ? 'Lee presión, cobertura y huecos por día antes de bajar al despacho fino.'
        : 'Revisa conteos, saturación y señales del mes; abre un día cuando necesites operar el detalle.';

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
        <MonthAgenda days={days} onOpenDay={onOpenDay} />
      ) : view === 'week' ? (
        <WeekAgenda days={days} onOpenDay={onOpenDay} />
      ) : (
        <DailyAgenda
          days={days}
          technicians={technicians}
          workOrdersById={workOrdersById}
          pendingVisitRequests={pendingVisitRequests}
          selectedPendingVisitRequestId={selectedPendingVisitRequestId}
          pendingAsideContent={pendingAsideContent}
          displayWindow={displayWindow}
          dailyDraft={dailyDraft}
          onSelectEvent={onSelectEvent}
          onSelectPendingVisit={onSelectPendingVisit}
          onOpenPendingVisitsInbox={onOpenPendingVisitsInbox}
          onCreateEventSlot={onCreateEventSlot}
          onPendingVisitDrop={onPendingVisitDrop}
          onDailyDraftChange={onDailyDraftChange}
          onDailyDraftConfirm={onDailyDraftConfirm}
          onDailyDraftDiscard={onDailyDraftDiscard}
        />
      )}
    </PortalPanel>
  );
}
