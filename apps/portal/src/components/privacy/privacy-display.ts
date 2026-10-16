export interface PrivacyDisplayOptions {
  privacyRestricted?: boolean;
  anonymizedAt?: string | null | undefined;
  emptyValue?: string | undefined;
}

/** Evita filtrar valores ausentes o centinelas técnicos a texto visible. */
export function privacyDisplayValue(
  value: string | number | null | undefined,
  options: PrivacyDisplayOptions = {},
): string {
  if (options.privacyRestricted) {
    return 'Datos bloqueados';
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (
      normalized &&
      normalized.toLowerCase() !== 'null' &&
      normalized.toLowerCase() !== 'undefined'
    ) {
      return normalized === 'ANONIMIZADO' ? 'Anonimizado' : normalized;
    }
  }

  return options.anonymizedAt ? 'Anonimizado' : (options.emptyValue ?? '—');
}

export function formatPrivacyDate(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return 'fecha no disponible';
  }

  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeZone: 'America/Bogota',
  }).format(parsed);
}
