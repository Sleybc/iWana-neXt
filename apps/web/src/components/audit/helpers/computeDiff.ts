/**
 * Compara oldValue y newValue y retorna todos los campos que cambiaron.
 * Extraído de AuditLogsTable para uso compartido en helpers y componentes.
 */
import { describeAuditFieldLabel } from '@/lib/platform-audit-vocabulary';

export function computeDiff(
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null,
): Array<{ field: string; old: unknown; new: unknown }> {
  if (!oldValue && !newValue) return [];
  if (!oldValue) {
    return Object.entries(newValue ?? {}).map(([field, val]) => ({
      field,
      old: '—',
      new: val,
    }));
  }
  if (!newValue) {
    return Object.entries(oldValue).map(([field, val]) => ({
      field,
      old: val,
      new: '—',
    }));
  }

  const diffs: Array<{ field: string; old: unknown; new: unknown }> = [];
  const allKeys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);

  for (const key of allKeys) {
    const oldVal = oldValue[key];
    const newVal = newValue[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diffs.push({ field: key, old: oldVal, new: newVal });
    }
  }

  return diffs.sort((a, b) => a.field.localeCompare(b.field));
}

/** Trunca un string a maxLength chars con '…' si lo supera */
export function truncate(value: unknown, maxLength = 50): string {
  if (value === null || value === undefined) return '—';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return str.length > maxLength ? `${str.slice(0, maxLength)}…` : str;
}

/** Renderiza un valor desconocido como string legible */
export function renderValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'Sí' : 'No';
  if (typeof val === 'object') return truncate(JSON.stringify(val), 80);
  return String(val);
}

/** Formatea el nombre de un campo camelCase a texto de producto */
export function formatFieldName(field: string, options?: { mode?: 'reading' | 'detail' }): string {
  return describeAuditFieldLabel(field, options) ?? '';
}

/** Abrevia un User-Agent a "Navegador Versión / OS" */
export function abbreviateUserAgent(ua: string | null): string {
  if (!ua) return '—';
  // Chrome
  const chrome = ua.match(/Chrome\/([\d]+)/);
  const firefox = ua.match(/Firefox\/([\d]+)/);
  const safari = ua.match(/Version\/([\d]+).*Safari/);
  const os = ua.includes('Mac')
    ? 'macOS'
    : ua.includes('Windows')
      ? 'Windows'
      : ua.includes('Linux')
        ? 'Linux'
        : 'desconocido';
  if (chrome) return `Chrome ${chrome[1]} / ${os}`;
  if (firefox) return `Firefox ${firefox[1]} / ${os}`;
  if (safari) return `Safari ${safari[1]} / ${os}`;
  return ua.slice(0, 40);
}
