const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function toLocalDateValue(date: Date | undefined): string {
  if (!date) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Normaliza ISO o `YYYY-MM-DD` a valor local de DatePicker. */
export function toLocalDateValueFromApi(value?: string | null): string {
  if (!value) {
    return '';
  }
  const day = value.slice(0, 10);
  return LOCAL_DATE_PATTERN.test(day) ? day : '';
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
