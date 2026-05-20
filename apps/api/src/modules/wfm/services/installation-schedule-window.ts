const INSTALLATION_START_MINUTES = 7 * 60;
const INSTALLATION_END_MINUTES = 18 * 60;

export interface OperatingTimeWindow {
  startTime: string;
  endTime: string;
}

type LocalDateTimeParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
};

function toLocalDateTimeParts(date: Date, timeZone: string): LocalDateTimeParts | null {
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  ) as Partial<LocalDateTimeParts>;

  if (!values.year || !values.month || !values.day || !values.hour || !values.minute) {
    return null;
  }

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
  };
}

export function getLocalDateString(date: Date, timeZone: string): string | null {
  const localDate = toLocalDateTimeParts(date, timeZone);

  if (!localDate) {
    return null;
  }

  return `${localDate.year}-${localDate.month}-${localDate.day}`;
}

export function isScheduleRangeWithinOperatingWindow(
  startAt: Date,
  endAt: Date,
  timeZone: string,
  window: OperatingTimeWindow,
): boolean {
  const localStart = toLocalDateTimeParts(startAt, timeZone);
  const localEnd = toLocalDateTimeParts(endAt, timeZone);

  if (!localStart || !localEnd) {
    return false;
  }

  const startMinutes = Number(localStart.hour) * 60 + Number(localStart.minute);
  const endMinutes = Number(localEnd.hour) * 60 + Number(localEnd.minute);
  const windowStartMinutes = toClockMinutes(window.startTime);
  const windowEndMinutes = toClockMinutes(window.endTime);
  const isSameLocalDay =
    localStart.year === localEnd.year &&
    localStart.month === localEnd.month &&
    localStart.day === localEnd.day;

  return (
    isSameLocalDay &&
    windowStartMinutes !== null &&
    windowEndMinutes !== null &&
    startMinutes >= windowStartMinutes &&
    endMinutes <= windowEndMinutes
  );
}

export function isInstallationScheduleWithinBusinessHours(
  startAt: Date,
  endAt: Date,
  timeZone: string,
): boolean {
  return isScheduleRangeWithinOperatingWindow(startAt, endAt, timeZone, {
    startTime: toClockString(INSTALLATION_START_MINUTES),
    endTime: toClockString(INSTALLATION_END_MINUTES),
  });
}

function toClockMinutes(value: string): number | null {
  const [hours, minutes] = value.split(':');
  const parsedHours = Number(hours);
  const parsedMinutes = Number(minutes);

  if (!Number.isInteger(parsedHours) || !Number.isInteger(parsedMinutes)) {
    return null;
  }

  return parsedHours * 60 + parsedMinutes;
}

function toClockString(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (totalMinutes % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}
