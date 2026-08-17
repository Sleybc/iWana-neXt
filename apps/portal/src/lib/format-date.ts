/**
 * Formatea una fecha ISO (YYYY-MM-DD) como fecha corta en español de Colombia
 * (es-CO). El valor se parsea por partes para evitar el corrimiento UTC, y ante
 * cualquier valor no parseable se devuelve el valor crudo (fallback seguro).
 */
export function formatDateOnlyEsCo(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  const [yearPart, monthPart, dayPart] = trimmed.split('-');
  if (!yearPart || !monthPart || !dayPart) {
    return value;
  }

  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return value;
  }

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  try {
    return date.toLocaleDateString('es-CO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return value;
  }
}
