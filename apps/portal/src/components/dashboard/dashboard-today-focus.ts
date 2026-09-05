/**
 * Foco de hoy — ratio operativo leído de contratos ya pedidos.
 * Sin serie temporal. 0 % solo cuando hay denominador real.
 */
import type { DashboardDataSourceId } from './dashboard-role-composition';

export type TodayFocusSourceStatus = 'idle' | 'loading' | 'updating' | 'success' | 'error';

export interface TodayFocusSourceSlice {
  status: TodayFocusSourceStatus;
  todayCount: number | null;
  overdueCount: number | null;
  openCount: number | null;
  atRiskCount: number | null;
  breachedCount: number | null;
  catalogSellableActiveCount: number | null;
  catalogActiveCount: number | null;
}

export interface TodayFocusSources {
  wfm: Pick<TodayFocusSourceSlice, 'status' | 'todayCount' | 'overdueCount'>;
  assurance: Pick<TodayFocusSourceSlice, 'status' | 'openCount' | 'atRiskCount' | 'breachedCount'>;
  commercial: Pick<
    TodayFocusSourceSlice,
    'status' | 'catalogSellableActiveCount' | 'catalogActiveCount'
  >;
}

export type TodayFocusResult =
  | { kind: 'hidden' }
  | { kind: 'loading' }
  | {
      kind: 'error';
      retrySource: 'wfm' | 'assurance' | 'commercial';
      message: string;
    }
  | {
      kind: 'empty';
      title: string;
      description: string;
      href: string;
      actionLabel: string;
    }
  | {
      kind: 'ratio';
      title: string;
      label: string;
      hint: string;
      done: number;
      total: number;
      percent: number;
      href: string;
      actionLabel: string;
    };

const FOCUS_TITLE = 'Foco de hoy';

function isPending(status: TodayFocusSourceStatus): boolean {
  return status === 'idle' || status === 'loading';
}

function clampPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

function resolveWfmFocus(
  slice: TodayFocusSources['wfm'],
): Exclude<TodayFocusResult, { kind: 'hidden' }> {
  if (isPending(slice.status) && slice.todayCount === null) {
    return { kind: 'loading' };
  }
  if (slice.status === 'error' && slice.todayCount === null) {
    return {
      kind: 'error',
      retrySource: 'wfm',
      message: 'No pudimos cargar el foco de campo. Reintenta.',
    };
  }
  const today = slice.todayCount ?? 0;
  const overdue = slice.overdueCount ?? 0;
  const total = today + overdue;
  if (total <= 0) {
    return {
      kind: 'empty',
      title: FOCUS_TITLE,
      description: 'No hay visitas de hoy ni vencidas. Revisa la agenda si necesitas programar.',
      href: '/dashboard/scheduling/agenda',
      actionLabel: 'Ver la agenda de hoy',
    };
  }
  return {
    kind: 'ratio',
    title: FOCUS_TITLE,
    label: 'Visitas del día frente a la carga',
    hint:
      overdue > 0 ? `${overdue} vencidas · ${today} en la agenda de hoy` : 'Sin visitas vencidas',
    done: today,
    total,
    percent: clampPercent(today, total),
    href: '/dashboard/scheduling/agenda',
    actionLabel: 'Ver la agenda de hoy',
  };
}

function resolveAssuranceFocus(
  slice: TodayFocusSources['assurance'],
): Exclude<TodayFocusResult, { kind: 'hidden' }> {
  if (isPending(slice.status) && slice.openCount === null) {
    return { kind: 'loading' };
  }
  if (slice.status === 'error' && slice.openCount === null) {
    return {
      kind: 'error',
      retrySource: 'assurance',
      message: 'No pudimos cargar el foco de la mesa de ayuda. Reintenta.',
    };
  }
  const open = slice.openCount ?? 0;
  if (open <= 0) {
    return {
      kind: 'empty',
      title: FOCUS_TITLE,
      description:
        'No hay casos abiertos ahora. Entra a la mesa de ayuda si hace falta registrar uno.',
      href: '/dashboard/assurance?status=OPEN',
      actionLabel: 'Ver la mesa de ayuda',
    };
  }
  const atRisk = slice.atRiskCount ?? 0;
  const breached = slice.breachedCount ?? 0;
  const done = Math.max(0, open - atRisk - breached);
  return {
    kind: 'ratio',
    title: FOCUS_TITLE,
    label: 'Casos al día frente a los abiertos',
    hint: `${done} de ${open} sin riesgo de incumplimiento`,
    done,
    total: open,
    percent: clampPercent(done, open),
    href: '/dashboard/assurance?status=OPEN',
    actionLabel: 'Ver la mesa de ayuda',
  };
}

function resolveCommercialFocus(
  slice: TodayFocusSources['commercial'],
): Exclude<TodayFocusResult, { kind: 'hidden' }> {
  if (isPending(slice.status) && slice.catalogActiveCount === null) {
    return { kind: 'loading' };
  }
  if (slice.status === 'error' && slice.catalogActiveCount === null) {
    return {
      kind: 'error',
      retrySource: 'commercial',
      message: 'No pudimos cargar el foco comercial. Reintenta.',
    };
  }
  const active = slice.catalogActiveCount ?? 0;
  if (active <= 0) {
    return {
      kind: 'empty',
      title: FOCUS_TITLE,
      description: 'Aún no hay catálogo activo para medir. Abre comercial para crear un plan.',
      href: '/dashboard/commercial',
      actionLabel: 'Ver comercial',
    };
  }
  const sellable = slice.catalogSellableActiveCount ?? 0;
  return {
    kind: 'ratio',
    title: FOCUS_TITLE,
    label: 'Catálogo listo para vender',
    hint: `${sellable} de ${active} ítems se pueden vender`,
    done: sellable,
    total: active,
    percent: clampPercent(sellable, active),
    href: '/dashboard/commercial',
    actionLabel: 'Ver comercial',
  };
}

export function resolveTodayFocus(
  requestedSources: readonly DashboardDataSourceId[],
  sources: TodayFocusSources,
): TodayFocusResult {
  const requested = new Set(requestedSources);
  if (requested.has('wfm')) {
    return resolveWfmFocus(sources.wfm);
  }
  if (requested.has('assurance')) {
    return resolveAssuranceFocus(sources.assurance);
  }
  if (requested.has('commercial')) {
    return resolveCommercialFocus(sources.commercial);
  }
  return { kind: 'hidden' };
}
