const INSTALLATION_START_MINUTES = 7 * 60;
const INSTALLATION_END_MINUTES = 18 * 60;

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

export function isInstallationScheduleWithinBusinessHours(
  startAt: Date,
  endAt: Date,
  timeZone: string,
): boolean {
  const localStart = toLocalDateTimeParts(startAt, timeZone);
  const localEnd = toLocalDateTimeParts(endAt, timeZone);

  if (!localStart || !localEnd) {
    return false;
  }

  const startMinutes = Number(localStart.hour) * 60 + Number(localStart.minute);
  const endMinutes = Number(localEnd.hour) * 60 + Number(localEnd.minute);
  const isSameLocalDay =
    localStart.year === localEnd.year &&
    localStart.month === localEnd.month &&
    localStart.day === localEnd.day;

  return (
    isSameLocalDay &&
    startMinutes >= INSTALLATION_START_MINUTES &&
    endMinutes <= INSTALLATION_END_MINUTES
  );
}
