type CivilDate = {
  year: number;
  month: number;
  day: number;
};

const FIXED_HOLIDAYS = [
  { month: 1, day: 1 },
  { month: 5, day: 1 },
  { month: 7, day: 20 },
  { month: 8, day: 7 },
  { month: 12, day: 8 },
  { month: 12, day: 25 },
] as const;

const EMILIANI_HOLIDAYS = [
  { month: 1, day: 6 },
  { month: 3, day: 19 },
  { month: 6, day: 29 },
  { month: 7, day: 9 },
  { month: 8, day: 15 },
  { month: 10, day: 12 },
  { month: 11, day: 1 },
  { month: 11, day: 11 },
] as const;

const MONTH_OFFSETS = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4] as const;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseCivilDate(value: string): CivilDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError('La fecha debe tener formato YYYY-MM-DD.');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError('La fecha civil no es válida.');
  }

  return { year, month, day };
}

function formatCivilDate({ year, month, day }: CivilDate): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Devuelve el día de la semana como 0=domingo ... 6=sábado, sin zona horaria. */
function dayOfWeek({ year, month, day }: CivilDate): number {
  const adjustedYear = year - (month < 3 ? 1 : 0);
  const monthOffset = MONTH_OFFSETS[month - 1];
  if (monthOffset === undefined) throw new RangeError('El mes civil no es válido.');
  return (
    (adjustedYear +
      Math.floor(adjustedYear / 4) -
      Math.floor(adjustedYear / 100) +
      Math.floor(adjustedYear / 400) +
      monthOffset +
      day) %
    7
  );
}

function addCivilDays(date: CivilDate, days: number): CivilDate {
  let { year, month, day } = date;
  const step = days < 0 ? -1 : 1;

  for (let remaining = Math.abs(days); remaining > 0; remaining -= 1) {
    day += step;
    if (day > daysInMonth(year, month)) {
      day = 1;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    } else if (day < 1) {
      month -= 1;
      if (month < 1) {
        month = 12;
        year -= 1;
      }
      day = daysInMonth(year, month);
    }
  }

  if (year < 1 || year > 9999) throw new RangeError('La fecha queda fuera del rango admitido.');
  return { year, month, day };
}

function followingMonday(date: CivilDate): CivilDate {
  const weekday = dayOfWeek(date);
  return addCivilDays(date, (8 - weekday) % 7);
}

function easterSunday(year: number): CivilDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

/**
 * Festivos nacionales colombianos observados en el año civil indicado.
 * Las fechas se representan como YYYY-MM-DD en el calendario civil de Bogotá.
 */
export function colombiaHolidays(year: number): ReadonlyArray<string> {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new RangeError('El año debe ser un entero entre 1 y 9999.');
  }

  const holidays = new Set<string>();
  for (const date of FIXED_HOLIDAYS) {
    holidays.add(formatCivilDate({ year, ...date }));
  }
  for (const date of EMILIANI_HOLIDAYS) {
    holidays.add(formatCivilDate(followingMonday({ year, ...date })));
  }

  const easter = easterSunday(year);
  const movableHolidays: Array<{ date: CivilDate; transferToMonday: boolean }> = [
    { date: addCivilDays(easter, -7), transferToMonday: false }, // Domingo de Ramos
    { date: addCivilDays(easter, -3), transferToMonday: false }, // Jueves Santo
    { date: addCivilDays(easter, -2), transferToMonday: false }, // Viernes Santo
    { date: easter, transferToMonday: false }, // Domingo de Resurrección
    { date: addCivilDays(easter, 39), transferToMonday: true }, // Ascensión
    { date: addCivilDays(easter, 60), transferToMonday: true }, // Corpus Christi
    { date: addCivilDays(easter, 68), transferToMonday: true }, // Sagrado Corazón
  ];

  for (const { date, transferToMonday } of movableHolidays) {
    holidays.add(formatCivilDate(transferToMonday ? followingMonday(date) : date));
  }

  return [...holidays].sort();
}

export function isColombiaBusinessDay(date: string): boolean {
  const civilDate = parseCivilDate(date);
  const weekday = dayOfWeek(civilDate);
  if (weekday === 0 || weekday === 6) return false;
  return !colombiaHolidays(civilDate.year).includes(date);
}

/** Cuenta días hábiles desde el día siguiente a la fecha de inicio. */
export function addColombiaBusinessDays(fromDate: string, days: number): string {
  const start = parseCivilDate(fromDate);
  if (!Number.isInteger(days) || days < 0) {
    throw new RangeError('La cantidad de días hábiles debe ser un entero no negativo.');
  }

  let current = start;
  let remaining = days;
  while (remaining > 0) {
    current = addCivilDays(current, 1);
    if (isColombiaBusinessDay(formatCivilDate(current))) remaining -= 1;
  }
  return formatCivilDate(current);
}

/** Suma meses calendario y limita el día al último día del mes de destino. */
export function addCalendarMonths(fromDate: string, months: number): string {
  const start = parseCivilDate(fromDate);
  if (!Number.isInteger(months)) throw new RangeError('La cantidad de meses debe ser un entero.');

  const absoluteMonth = start.year * 12 + start.month - 1 + months;
  const year = Math.floor(absoluteMonth / 12);
  const month = (((absoluteMonth % 12) + 12) % 12) + 1;
  if (year < 1 || year > 9999) throw new RangeError('La fecha queda fuera del rango admitido.');
  return formatCivilDate({ year, month, day: Math.min(start.day, daysInMonth(year, month)) });
}
