import { computeDiff } from './helpers/computeDiff';
import { deriveSeverity } from './helpers/deriveSeverity';
import { AUTH_ACTIONS, SECURITY_ACTIONS, TENANT_ACTIONS } from './helpers/actionLabel';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

/** Presets de filtro del resumen sobre el lote cargado (cliente). */
export type SummaryPreset = 'critical' | 'access' | 'security' | 'tenants' | 'actors';

/** Ventana temporal del resumen (misma que AuditSummary). */
export type SummaryWindow = '24h' | '7d';

export interface SummaryPresetEntry {
  action: string;
  entityType: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  userId?: string | null;
}

export function summaryWindowStart(window: SummaryWindow): Date {
  const now = new Date();
  if (window === '7d') return new Date(now.getTime() - 7 * 24 * 3600_000);
  return new Date(now.getTime() - 24 * 3600_000);
}

/**
 * Entradas del lote del resumen dentro de la ventana actual (24h/7d).
 * Misma frontera que la mitad «current» de splitSummaryWindow.
 */
export function filterEntriesInSummaryWindow<T extends { createdAt: string }>(
  entries: T[],
  window: SummaryWindow,
): T[] {
  const start = summaryWindowStart(window);
  return entries.filter((e) => new Date(e.createdAt) >= start);
}

/** Split current/previous para deltas del resumen. */
export function splitSummaryWindow<T extends { createdAt: string }>(
  entries: T[],
  window: SummaryWindow,
): { current: T[]; previous: T[] } {
  const start = summaryWindowStart(window);
  const prevStart = new Date(start.getTime() - (window === '7d' ? 7 : 1) * 24 * 3600_000);

  const current = entries.filter((e) => new Date(e.createdAt) >= start);
  const previous = entries.filter(
    (e) => new Date(e.createdAt) >= prevStart && new Date(e.createdAt) < start,
  );
  return { current, previous };
}

/**
 * Mismas reglas de predicado que AuditSummary usa para contar señales.
 * - critical: deriveSeverity === 'critical'
 * - access: AUTH_ACTIONS
 * - security: SECURITY_ACTIONS ∪ TENANT_ACTIONS
 * - tenants: entityType === 'Tenant'
 * - actors: todas las filas del lote (uniqueActors cuenta todas las filas de la ventana)
 */
export function matchesSummaryPreset(
  entry: SummaryPresetEntry,
  preset: SummaryPreset,
  _ctx?: unknown,
): boolean {
  switch (preset) {
    case 'critical': {
      const diff = computeDiff(entry.oldValue, entry.newValue);
      return deriveSeverity(entry.action, entry.entityType, diff) === 'critical';
    }
    case 'access':
      return AUTH_ACTIONS.has(entry.action);
    case 'security':
      return SECURITY_ACTIONS.has(entry.action) || TENANT_ACTIONS.has(entry.action);
    case 'tenants':
      return entry.entityType === 'Tenant';
    case 'actors':
      return true;
    default: {
      const _exhaustive: never = preset;
      return _exhaustive;
    }
  }
}

/** Label de señal visible (no id técnico). */
export function summaryPresetSignalLabel(preset: SummaryPreset): string {
  switch (preset) {
    case 'critical':
      return PLATFORM_UI_COPY.audit.criticalChanges;
    case 'access':
      return PLATFORM_UI_COPY.audit.accesses;
    case 'security':
      return PLATFORM_UI_COPY.audit.accessAndSecurity;
    case 'tenants':
      return PLATFORM_UI_COPY.audit.companiesWithChanges;
    case 'actors':
      return PLATFORM_UI_COPY.audit.whoChanged;
    default: {
      const _exhaustive: never = preset;
      return _exhaustive;
    }
  }
}

/** Chip DS-A-CHIP: «Mostrando: {label} · lote del resumen». */
export function formatSummaryFilterChip(preset: SummaryPreset): string {
  return PLATFORM_UI_COPY.audit.summaryFilterChip.replace(
    '{label}',
    summaryPresetSignalLabel(preset),
  );
}
