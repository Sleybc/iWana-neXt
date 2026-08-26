import { WfmWorkType } from '@iwana/shared';
import type { WfmOperatingWindowResult, WfmScheduleEvent } from '@/lib/api-client';
import {
  buildScheduleWindow,
  deriveDurationMinutes,
  isScheduleStartInPast,
  isScheduleWindowAllowedForWorkType,
  toLocalTimeValue,
} from './schedule-event-time';

export const PENDING_VISIT_DRAG_MIME = 'application/x-iwana-pending-visit';
export const DAILY_DRAFT_MIN_DURATION_MINUTES = 30;
export const DAILY_TIMELINE_FALLBACK_START_HOUR = 6;
export const DAILY_TIMELINE_FALLBACK_END_HOUR = 20;
export const DAILY_TIMELINE_SLOT_MINUTES = 30;

export type DailyDraftValidationState =
  | 'valid'
  | 'out-of-window'
  | 'conflict'
  | 'incomplete'
  | 'in-the-past';

export type DailyDraftEvent = {
  visitRequestId: string;
  organizationSiteId: string | null;
  workType: WfmWorkType;
  durationMinutes: number;
  customerDisplayName: string;
  title: string;
  assignedUserId: string;
  dayKey: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  source: 'pending-visit-drop';
  validationState: DailyDraftValidationState;
};

export type PendingVisitDragPayload = {
  visitRequestId: string;
  organizationSiteId: string | null;
  workType: WfmWorkType;
  durationMinutes: number;
  customerDisplayName: string;
  title: string;
};

export type DailyDisplayWindow = {
  startHour: number;
  endHour: number;
  operatingStartMinutes: number | null;
  operatingEndMinutes: number | null;
  isClosedDay: boolean;
};

export type DailyDraftDropInput = PendingVisitDragPayload & {
  assignedUserId: string;
  dayKey: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toMinutes(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const [hoursPart, minutesPart] = value.split(':');
  const hours = Number(hoursPart);
  const minutes = Number(minutesPart);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

export function snapMinutesToHalfHour(totalMinutes: number): number {
  return Math.round(totalMinutes / DAILY_TIMELINE_SLOT_MINUTES) * DAILY_TIMELINE_SLOT_MINUTES;
}

export function buildDisplayWindowFromOperatingWindow(
  operatingWindow?: WfmOperatingWindowResult | null,
): DailyDisplayWindow {
  if (!operatingWindow || operatingWindow.source === 'MISSING_CONFIGURATION') {
    return {
      startHour: DAILY_TIMELINE_FALLBACK_START_HOUR,
      endHour: DAILY_TIMELINE_FALLBACK_END_HOUR,
      operatingStartMinutes: null,
      operatingEndMinutes: null,
      isClosedDay: false,
    };
  }

  if (operatingWindow.status === 'CLOSED') {
    return {
      startHour: DAILY_TIMELINE_FALLBACK_START_HOUR,
      endHour: DAILY_TIMELINE_FALLBACK_END_HOUR,
      operatingStartMinutes: null,
      operatingEndMinutes: null,
      isClosedDay: true,
    };
  }

  const operatingStartMinutes = toMinutes(operatingWindow.startTime);
  const operatingEndMinutes = toMinutes(operatingWindow.endTime);

  if (operatingStartMinutes === null || operatingEndMinutes === null) {
    return {
      startHour: DAILY_TIMELINE_FALLBACK_START_HOUR,
      endHour: DAILY_TIMELINE_FALLBACK_END_HOUR,
      operatingStartMinutes: null,
      operatingEndMinutes: null,
      isClosedDay: false,
    };
  }

  const paddedStartHour = Math.max(0, Math.floor(operatingStartMinutes / 60) - 1);
  const paddedEndHour = Math.min(24, Math.ceil(operatingEndMinutes / 60) + 1);

  return {
    startHour: paddedStartHour,
    endHour: Math.max(paddedEndHour, paddedStartHour + 2),
    operatingStartMinutes,
    operatingEndMinutes,
    isClosedDay: false,
  };
}

export function buildHourLabelsForDisplayWindow(displayWindow: DailyDisplayWindow): string[] {
  return Array.from({ length: displayWindow.endHour - displayWindow.startHour }, (_, index) => {
    const hour = displayWindow.startHour + index;
    return `${pad(hour)}:00`;
  });
}

export function buildTimelineSlotsForDisplayWindow(
  displayWindow: DailyDisplayWindow,
  slotMinutes: number = DAILY_TIMELINE_SLOT_MINUTES,
): string[] {
  const safeSlotMinutes = slotMinutes > 0 ? slotMinutes : DAILY_TIMELINE_SLOT_MINUTES;
  const totalSlots = ((displayWindow.endHour - displayWindow.startHour) * 60) / safeSlotMinutes;

  return Array.from({ length: totalSlots }, (_, index) => {
    const totalMinutes = displayWindow.startHour * 60 + index * safeSlotMinutes;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${pad(hours)}:${pad(minutes)}`;
  });
}

export function buildHalfHourSlotsForDisplayWindow(displayWindow: DailyDisplayWindow): string[] {
  return buildTimelineSlotsForDisplayWindow(displayWindow, DAILY_TIMELINE_SLOT_MINUTES);
}

export function getTimelineMinutesRangeForDisplayWindow(displayWindow: DailyDisplayWindow): {
  startMinutes: number;
  totalMinutes: number;
} {
  return {
    startMinutes: displayWindow.startHour * 60,
    totalMinutes: (displayWindow.endHour - displayWindow.startHour) * 60,
  };
}

export function buildDailyDraftFromDrop(input: DailyDraftDropInput): DailyDraftEvent {
  return {
    visitRequestId: input.visitRequestId,
    organizationSiteId: input.organizationSiteId,
    workType: input.workType,
    durationMinutes: input.durationMinutes,
    customerDisplayName: input.customerDisplayName,
    title: input.title,
    assignedUserId: input.assignedUserId,
    dayKey: input.dayKey,
    scheduledStartAt: input.scheduledStartAt,
    scheduledEndAt: input.scheduledEndAt,
    source: 'pending-visit-drop',
    validationState: 'incomplete',
  };
}

function eventsConflict(draft: DailyDraftEvent, events: WfmScheduleEvent[]): boolean {
  const draftStart = new Date(draft.scheduledStartAt).getTime();
  const draftEnd = new Date(draft.scheduledEndAt).getTime();

  return events.some((event) => {
    if (event.assignedUserId !== draft.assignedUserId) {
      return false;
    }

    const eventStart = new Date(event.scheduledStartAt).getTime();
    const eventEnd = new Date(event.scheduledEndAt).getTime();

    return draftStart < eventEnd && draftEnd > eventStart;
  });
}

export function validateDailyDraft(
  draft: DailyDraftEvent,
  operatingWindow: WfmOperatingWindowResult | null | undefined,
  events: WfmScheduleEvent[],
): DailyDraftEvent {
  if (!draft.visitRequestId || !draft.assignedUserId || !draft.dayKey) {
    return { ...draft, validationState: 'incomplete' };
  }

  const durationMinutes = deriveDurationMinutes(draft.scheduledStartAt, draft.scheduledEndAt);
  if (durationMinutes < DAILY_DRAFT_MIN_DURATION_MINUTES) {
    return { ...draft, validationState: 'incomplete' };
  }

  const scheduleWindow = buildScheduleWindow(
    draft.dayKey,
    toLocalTimeValue(draft.scheduledStartAt),
    durationMinutes,
  );

  if (!scheduleWindow) {
    return { ...draft, validationState: 'incomplete' };
  }

  if (
    draft.workType === WfmWorkType.INSTALLATION &&
    !isScheduleWindowAllowedForWorkType(draft.workType, scheduleWindow, operatingWindow)
  ) {
    return { ...draft, validationState: 'out-of-window' };
  }

  if (isScheduleStartInPast(draft.scheduledStartAt)) {
    return { ...draft, validationState: 'in-the-past' };
  }

  if (eventsConflict(draft, events)) {
    return { ...draft, validationState: 'conflict' };
  }

  return { ...draft, validationState: 'valid' };
}

export function isSameDailyDraft(left: DailyDraftEvent, right: DailyDraftEvent): boolean {
  return (
    left.visitRequestId === right.visitRequestId &&
    left.assignedUserId === right.assignedUserId &&
    left.dayKey === right.dayKey &&
    left.scheduledStartAt === right.scheduledStartAt &&
    left.scheduledEndAt === right.scheduledEndAt &&
    left.validationState === right.validationState
  );
}

export function moveDailyDraftToTime(
  draft: DailyDraftEvent,
  dayKey: string,
  assignedUserId: string,
  timeValue: string,
): DailyDraftEvent {
  const scheduleWindow = buildScheduleWindow(dayKey, timeValue, draft.durationMinutes);

  if (!scheduleWindow) {
    return draft;
  }

  return {
    ...draft,
    dayKey,
    assignedUserId,
    scheduledStartAt: scheduleWindow.startAt.toISOString(),
    scheduledEndAt: scheduleWindow.endAt.toISOString(),
  };
}

export function resizeDailyDraftStart(
  draft: DailyDraftEvent,
  nextStartTime: string,
): DailyDraftEvent {
  const endAt = new Date(draft.scheduledEndAt);
  const scheduleWindow = buildScheduleWindow(
    draft.dayKey,
    nextStartTime,
    deriveDurationMinutes(`${draft.dayKey}T${nextStartTime}`, draft.scheduledEndAt),
  );

  if (!scheduleWindow || scheduleWindow.endAt.getTime() !== endAt.getTime()) {
    const snappedStartMinutes = snapMinutesToHalfHour(
      Number(nextStartTime.split(':')[0]) * 60 + Number(nextStartTime.split(':')[1]),
    );
    const endMinutes = endAt.getHours() * 60 + endAt.getMinutes();
    const durationMinutes = Math.max(
      DAILY_DRAFT_MIN_DURATION_MINUTES,
      snapMinutesToHalfHour(endMinutes - snappedStartMinutes),
    );
    const rebuilt = buildScheduleWindow(
      draft.dayKey,
      `${pad(Math.floor(snappedStartMinutes / 60))}:${pad(snappedStartMinutes % 60)}`,
      durationMinutes,
    );

    if (!rebuilt) {
      return draft;
    }

    return {
      ...draft,
      durationMinutes,
      scheduledStartAt: rebuilt.startAt.toISOString(),
      scheduledEndAt: rebuilt.endAt.toISOString(),
    };
  }

  return {
    ...draft,
    durationMinutes: deriveDurationMinutes(
      scheduleWindow.scheduledStartAtLocal,
      scheduleWindow.scheduledEndAtLocal,
    ),
    scheduledStartAt: scheduleWindow.startAt.toISOString(),
    scheduledEndAt: scheduleWindow.endAt.toISOString(),
  };
}

export function resizeDailyDraftEnd(draft: DailyDraftEvent, nextEndTime: string): DailyDraftEvent {
  const startTime = toLocalTimeValue(draft.scheduledStartAt);
  const [endHourPart = '00', endMinutePart = '00'] = nextEndTime.split(':');
  const endMinutes = snapMinutesToHalfHour(Number(endHourPart) * 60 + Number(endMinutePart));
  const startMinutes =
    Number(startTime.split(':')[0]) * 60 + Number(startTime.split(':')[1] ?? '0');
  const durationMinutes = Math.max(
    DAILY_DRAFT_MIN_DURATION_MINUTES,
    snapMinutesToHalfHour(endMinutes - startMinutes),
  );
  const scheduleWindow = buildScheduleWindow(draft.dayKey, startTime, durationMinutes);

  if (!scheduleWindow) {
    return draft;
  }

  return {
    ...draft,
    durationMinutes,
    scheduledStartAt: scheduleWindow.startAt.toISOString(),
    scheduledEndAt: scheduleWindow.endAt.toISOString(),
  };
}

export function serializePendingVisitDragPayload(payload: PendingVisitDragPayload): string {
  return JSON.stringify(payload);
}

export function parsePendingVisitDragPayload(raw: string): PendingVisitDragPayload | null {
  try {
    const parsed = JSON.parse(raw) as PendingVisitDragPayload;
    if (!parsed?.visitRequestId || !parsed?.workType) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}
