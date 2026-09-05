/**
 * Derivación de salud B1b (centro de mando).
 * Prioridad: En riesgo > Atención > Al día. Sin dato no finge 0.
 *
 * UX: docs/specs/2026-09-04-portal-dashboard-centro-mando-ux-spec.md
 */
import type { DashboardMetricSourceStatus } from './dashboard-role-composition';
import {
  resolveDashboardModuleHealth,
  type DashboardDataSourceId,
  type DashboardModuleHealthId,
  type DashboardModuleHealthStatus,
} from './dashboard-role-composition';

export interface ModuleHealthSnapshot {
  requestedSources: ReadonlySet<DashboardDataSourceId>;
  sourceStatus: (id: DashboardDataSourceId) => DashboardMetricSourceStatus;
  todayLocalDate: string;
  wfm: {
    overdueCount: number;
    readyToScheduleCount: number;
    overdueSlaCount: number;
    alertsCount: number;
  } | null;
  assurance: {
    atRiskCount: number;
    breachedCount: number;
  } | null;
  commercial: {
    offersAtRiskCount: number;
    missingCurrentPriceCount: number;
  } | null;
  inventory: {
    itemsCount: number;
    totalOnHand: number;
  } | null;
  configurationAlertCount: number | null;
}

export type ModuleHealthChipState = 'idle' | 'loading' | 'error';

export interface ResolvedModuleHealth {
  id: DashboardModuleHealthId;
  label: string;
  status: DashboardModuleHealthStatus;
  value: number | null;
  href: string;
  state: ModuleHealthChipState;
  sources: readonly DashboardDataSourceId[];
}

function sourceStates(
  sources: readonly DashboardDataSourceId[],
  snapshot: ModuleHealthSnapshot,
): DashboardMetricSourceStatus[] {
  return sources.map((id) => snapshot.sourceStatus(id));
}

function resolveChipState(
  sources: readonly DashboardDataSourceId[],
  snapshot: ModuleHealthSnapshot,
): ModuleHealthChipState | 'navigation' | 'ready' {
  if (sources.length === 0) return 'navigation';
  const requested = sources.filter((id) => snapshot.requestedSources.has(id));
  if (requested.length === 0) return 'navigation';
  const statuses = sourceStates(requested, snapshot);
  if (statuses.some((s) => s === 'error')) return 'error';
  if (statuses.some((s) => s === 'loading' || s === 'idle')) return 'loading';
  return 'ready';
}

function schedulingHealth(
  snapshot: ModuleHealthSnapshot,
  fallbackHref: string,
): Pick<ResolvedModuleHealth, 'status' | 'value' | 'href'> {
  const data = snapshot.wfm;
  if (!data) {
    return { status: 'unknown', value: null, href: fallbackHref };
  }
  const overdue = data.overdueCount;
  const overdueSla = data.overdueSlaCount;
  const ready = data.readyToScheduleCount;
  if (overdue > 0 || overdueSla > 0) {
    const value = overdue > 0 ? overdue : overdueSla;
    const href =
      overdue > 0
        ? `/dashboard/scheduling/agenda?view=day&fromDate=${encodeURIComponent(snapshot.todayLocalDate)}`
        : '/dashboard/scheduling/pending-visits?status=READY_TO_SCHEDULE';
    return { status: 'at-risk', value, href };
  }
  if (ready > 0 || data.alertsCount > 0) {
    return {
      status: 'attention',
      value: ready > 0 ? ready : data.alertsCount,
      href: '/dashboard/scheduling/pending-visits?status=READY_TO_SCHEDULE',
    };
  }
  return { status: 'ok', value: null, href: fallbackHref };
}

function helpDeskHealth(
  snapshot: ModuleHealthSnapshot,
  fallbackHref: string,
): Pick<ResolvedModuleHealth, 'status' | 'value' | 'href'> {
  const data = snapshot.assurance;
  if (!data) return { status: 'unknown', value: null, href: fallbackHref };
  if (data.breachedCount > 0) {
    return {
      status: 'at-risk',
      value: data.breachedCount,
      href: '/dashboard/assurance?slaBreachStatus=AT_RISK',
    };
  }
  if (data.atRiskCount > 0) {
    return {
      status: 'attention',
      value: data.atRiskCount,
      href: '/dashboard/assurance?slaBreachStatus=AT_RISK',
    };
  }
  return { status: 'ok', value: null, href: fallbackHref };
}

function commercialHealth(
  snapshot: ModuleHealthSnapshot,
  fallbackHref: string,
): Pick<ResolvedModuleHealth, 'status' | 'value' | 'href'> {
  const data = snapshot.commercial;
  if (!data) return { status: 'unknown', value: null, href: fallbackHref };
  if (data.offersAtRiskCount > 0) {
    return { status: 'at-risk', value: data.offersAtRiskCount, href: fallbackHref };
  }
  if (data.missingCurrentPriceCount > 0) {
    return {
      status: 'attention',
      value: data.missingCurrentPriceCount,
      href: '/dashboard/commercial?tab=plans&missingPrice=1',
    };
  }
  return { status: 'ok', value: null, href: fallbackHref };
}

function inventoryHealth(
  snapshot: ModuleHealthSnapshot,
  fallbackHref: string,
): Pick<ResolvedModuleHealth, 'status' | 'value' | 'href'> {
  const data = snapshot.inventory;
  if (!data) return { status: 'unknown', value: null, href: fallbackHref };
  if (data.itemsCount === 0 || data.totalOnHand === 0) {
    return { status: 'attention', value: data.totalOnHand, href: fallbackHref };
  }
  return { status: 'ok', value: null, href: fallbackHref };
}

function configurationHealth(
  snapshot: ModuleHealthSnapshot,
  fallbackHref: string,
): Pick<ResolvedModuleHealth, 'status' | 'value' | 'href'> {
  const count = snapshot.configurationAlertCount;
  if (count == null) return { status: 'unknown', value: null, href: fallbackHref };
  if (count > 0) {
    return { status: 'attention', value: count, href: fallbackHref };
  }
  return { status: 'ok', value: null, href: fallbackHref };
}

export function resolveModuleHealthChip(
  id: DashboardModuleHealthId,
  snapshot: ModuleHealthSnapshot,
): ResolvedModuleHealth {
  const definition = resolveDashboardModuleHealth(id);
  const chipState = resolveChipState(definition.sources, snapshot);
  const navigationHref =
    id === 'scheduling' && chipState === 'navigation'
      ? '/dashboard/scheduling/agenda'
      : definition.fallbackHref;

  if (chipState === 'navigation') {
    return {
      id,
      label: definition.label,
      status: 'unknown',
      value: null,
      href: navigationHref,
      state: 'idle',
      sources: definition.sources,
    };
  }

  if (chipState === 'loading') {
    return {
      id,
      label: definition.label,
      status: 'unknown',
      value: null,
      href: definition.fallbackHref,
      state: 'loading',
      sources: definition.sources,
    };
  }

  if (chipState === 'error') {
    return {
      id,
      label: definition.label,
      status: 'unknown',
      value: null,
      href: definition.fallbackHref,
      state: 'error',
      sources: definition.sources,
    };
  }

  let derived: Pick<ResolvedModuleHealth, 'status' | 'value' | 'href'>;
  switch (id) {
    case 'scheduling':
      derived = schedulingHealth(snapshot, definition.fallbackHref);
      break;
    case 'help-desk':
      derived = helpDeskHealth(snapshot, definition.fallbackHref);
      break;
    case 'commercial':
      derived = commercialHealth(snapshot, definition.fallbackHref);
      break;
    case 'opportunities':
      derived = { status: 'ok', value: null, href: definition.fallbackHref };
      break;
    case 'inventory':
      derived = inventoryHealth(snapshot, definition.fallbackHref);
      break;
    case 'configuration':
      derived = configurationHealth(snapshot, definition.fallbackHref);
      break;
    case 'operations':
      derived = { status: 'unknown', value: null, href: definition.fallbackHref };
      break;
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }

  return {
    id,
    label: definition.label,
    status: derived.status,
    value: derived.value,
    href: derived.href,
    state: 'idle',
    sources: definition.sources,
  };
}
