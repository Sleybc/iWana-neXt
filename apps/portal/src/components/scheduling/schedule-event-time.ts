import { WfmWorkType } from '@iwana/shared';

type QuickDurationOption = {
  label: string;
  minutes: number;
};

type TimeOption = {
  value: string;
  label: string;
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const QUICK_DURATION_OPTIONS: QuickDurationOption[] = [
  { label: '45 min', minutes: 45 },
  { label: '1 h', minutes: 60 },
  { label: '1 h 30 min', minutes: 90 },
  { label: '2 h', minutes: 120 },
  { label: '2 h 30 min', minutes: 150 },
  { label: '3 h', minutes: 180 },
];

const INSTALLATION_SCHEDULE_START_MINUTES = 7 * 60;
const INSTALLATION_SCHEDULE_END_MINUTES = 18 * 60;

export const SCHEDULE_TIME_OPTIONS: TimeOption[] = Array.from({ length: 24 * 4 }, (_, index) => {
  const totalMinutes = index * 15;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const value = `${pad(hours)}:${pad(minutes)}`;

  return { value, label: value };
});

export const INSTALLATION_SCHEDULE_TIME_OPTIONS: TimeOption[] = SCHEDULE_TIME_OPTIONS.filter(
  (option) => {
    const [hoursPart, minutesPart] = option.value.split(':');
    const hours = Number(hoursPart);
    const minutes = Number(minutesPart);
    const totalMinutes = hours * 60 + minutes;

    return (
      Number.isFinite(totalMinutes) &&
      totalMinutes >= INSTALLATION_SCHEDULE_START_MINUTES &&
      totalMinutes <= INSTALLATION_SCHEDULE_END_MINUTES
    );
  },
);

export function getScheduleTimeOptionsForWorkType(type?: WfmWorkType | null): TimeOption[] {
  return type === WfmWorkType.INSTALLATION
    ? INSTALLATION_SCHEDULE_TIME_OPTIONS
    : SCHEDULE_TIME_OPTIONS;
}

export function isScheduleWindowAllowedForWorkType(
  type: WfmWorkType,
  scheduleWindow: {
    startAt: Date;
    endAt: Date;
  } | null,
): boolean {
  if (!scheduleWindow) {
    return true;
  }

  if (type !== WfmWorkType.INSTALLATION) {
    return true;
  }

  const startMinutes = scheduleWindow.startAt.getHours() * 60 + scheduleWindow.startAt.getMinutes();
  const endMinutes = scheduleWindow.endAt.getHours() * 60 + scheduleWindow.endAt.getMinutes();

  return (
    scheduleWindow.startAt.toDateString() === scheduleWindow.endAt.toDateString() &&
    startMinutes >= INSTALLATION_SCHEDULE_START_MINUTES &&
    endMinutes <= INSTALLATION_SCHEDULE_END_MINUTES
  );
}

export function getDefaultDurationForWorkType(type: WfmWorkType): number {
  switch (type) {
    case WfmWorkType.INSTALLATION:
      return 120;
    case WfmWorkType.MAINTENANCE:
      return 90;
    case WfmWorkType.SUPPORT:
      return 60;
    default:
      return 60;
  }
}

export function buildDefaultScheduleStart(offsetHours: number): {
  scheduledDateLocal: string;
  scheduledStartTimeLocal: string;
} {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + offsetHours);

  return {
    scheduledDateLocal: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    scheduledStartTimeLocal: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

export function toLocalDateValue(value: string | Date): string {
  if (typeof value === 'string' && LOCAL_DATE_PATTERN.test(value)) {
    return value;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toDateFromLocalDateValue(value?: string): Date | undefined {
  if (!value || !LOCAL_DATE_PATTERN.test(value)) {
    return undefined;
  }

  const [yearPart, monthPart, dayPart] = value.split('-');
  if (!yearPart || !monthPart || !dayPart) {
    return undefined;
  }

  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return undefined;
  }

  const date = new Date(year, month - 1, day);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date;
}

export function toLocalDateTimeParts(value?: string | Date | null): {
  dateLocal: string;
  timeLocal: string;
} {
  if (!value) {
    return { dateLocal: '', timeLocal: '' };
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return { dateLocal: '', timeLocal: '' };
  }

  return {
    dateLocal: toLocalDateValue(date),
    timeLocal: toLocalTimeValue(date),
  };
}

export function toLocalTimeValue(value: string | Date): string {
  const date = new Date(value);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function deriveDurationMinutes(start: string | Date, end: string | Date): number {
  const startAt = new Date(start).getTime();
  const endAt = new Date(end).getTime();

  if (Number.isNaN(startAt) || Number.isNaN(endAt) || endAt <= startAt) {
    return 0;
  }

  return Math.round((endAt - startAt) / 60000);
}

export function buildScheduleWindow(
  scheduledDateLocal: string,
  scheduledStartTimeLocal: string,
  durationMinutes: number,
): {
  startAt: Date;
  endAt: Date;
  scheduledStartAtLocal: string;
  scheduledEndAtLocal: string;
} | null {
  if (!scheduledDateLocal || !scheduledStartTimeLocal || !Number.isFinite(durationMinutes)) {
    return null;
  }

  const scheduledStartAtLocal = `${scheduledDateLocal}T${scheduledStartTimeLocal}`;
  const startAt = new Date(scheduledStartAtLocal);

  if (Number.isNaN(startAt.getTime())) {
    return null;
  }

  const endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000);

  if (Number.isNaN(endAt.getTime())) {
    return null;
  }

  return {
    startAt,
    endAt,
    scheduledStartAtLocal,
    scheduledEndAtLocal: `${endAt.getFullYear()}-${pad(endAt.getMonth() + 1)}-${pad(endAt.getDate())}T${pad(endAt.getHours())}:${pad(endAt.getMinutes())}`,
  };
}

export function toIsoFromLocalDateAndTime(
  dateLocal?: string,
  timeLocal?: string,
): string | undefined {
  if (!dateLocal || !timeLocal) {
    return undefined;
  }

  return new Date(`${dateLocal}T${timeLocal}`).toISOString();
}
