// apps/portal/src/components/dashboard/DashboardClient.tsx
'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { ExpedienteStatus, UserRole, type SubscriberQueueCounts } from '@iwana/shared';
import { Badge, cn } from '@iwana/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  PortalAlert,
  PortalEmptyState,
  PortalModuleHealthChip,
  PortalNavListRow,
  PortalPanel,
  PortalSkeletonBlock,
  PortalDataTableHead,
  interactiveFocusClassName,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
  portalDataTableShellClassName,
  portalInlineTextLinkClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import { useAuth } from '@/components/auth/AuthProvider';
import { resolveTenantSlug } from '@/lib/tenant-resolution';
import { loadAuditFeed } from '@/lib/audit-feed-cache';
import {
  ApiError,
  assuranceApi,
  billingCyclesApi,
  commercialApi,
  crmApi,
  dashboardApi,
  inventoryApi,
  networkApi,
  subscribersApi,
  tenantSelfApi,
  wfmApi,
  type AssuranceDashboardSummary,
  type AuditLogEntry,
  type CommercialDashboardSummary,
  type DashboardSummary,
  type DashboardSummaryTenant,
  type InventoryDashboardSummary,
  type TenantPublicBranding,
  type TenantSelf,
  type TenantSelfSettings,
  type WfmDashboardAlert,
  type WfmDashboardSummary,
} from '@/lib/api-client';
import { TenantSummaryCard } from './TenantSummaryCard';
import { RecentActivityPanel } from './RecentActivityPanel';
import {
  DASHBOARD_AREA_REGISTRY,
  DASHBOARD_ATTENTION_SOURCES,
  getDashboardRoleComposition,
  isUserRole,
  resolveDashboardBlock,
  resolveDashboardDataSources,
  resolveDashboardMetric,
  splitDashboardModuleHealthIds,
  toLocalDayKey,
  type DashboardAreaId,
  type DashboardAttentionId,
  type DashboardBlockId,
  type DashboardDataSourceId,
  type DashboardMetricId,
  type DashboardModuleHealthId,
  type DashboardRoleComposition,
} from './dashboard-role-composition';
import { resolveModuleHealthChip, type ModuleHealthSnapshot } from './dashboard-module-health';
import { resolveAttentionQueue } from './dashboard-attention-queue';
import { DashboardAttentionQueue } from './DashboardAttentionQueue';
import {
  DashboardAreaCards,
  casePrioritySegments,
  subscriberBaseSegments,
  type DashboardAreaHealth,
  type DashboardProvisioningCounts,
} from './DashboardAreaCards';
import { DashboardPulse, type DashboardPulseCell } from './DashboardPulse';
import { DashboardStackBar, formatDashboardNumber } from './dashboard-visuals';

type LoadStatus = 'idle' | 'loading' | 'updating' | 'success' | 'error';

interface SourceState<T> {
  status: LoadStatus;
  data: T | null;
  error: string | null;
  lastSuccessAt: string | null;
}

type CrmPipelineSummary = { data: Record<string, number>; total: number };

interface DashboardSourcesState {
  'public-branding': SourceState<TenantPublicBranding>;
  'tenant-summary': SourceState<DashboardSummary>;
  'tenant-me': SourceState<{ tenant: TenantSelf; settings: TenantSelfSettings }>;
  wfm: SourceState<WfmDashboardSummary>;
  assurance: SourceState<AssuranceDashboardSummary>;
  commercial: SourceState<CommercialDashboardSummary>;
  inventory: SourceState<InventoryDashboardSummary>;
  crm: SourceState<CrmPipelineSummary>;
  audit: SourceState<AuditLogEntry[]>;
  subscribers: SourceState<SubscriberQueueCounts>;
  /** Servicios con corte programado hoy. */
  cutoff: SourceState<number>;
  provisioning: SourceState<DashboardProvisioningCounts>;
  /** Productos con sugerencia de reposición. */
  replenishment: SourceState<number>;
}

const CLOSED_PIPELINE_STATUSES = new Set<string>([
  ExpedienteStatus.CLIENTE_ACTIVO,
  ExpedienteStatus.DESCARTADO,
]);

const TAB_REFRESH_MS = 5 * 60 * 1000;

function emptySource<T>(): SourceState<T> {
  return { status: 'idle', data: null, error: null, lastSuccessAt: null };
}

function createInitialSources(): DashboardSourcesState {
  return {
    'public-branding': emptySource(),
    'tenant-summary': emptySource(),
    'tenant-me': emptySource(),
    wfm: emptySource(),
    assurance: emptySource(),
    commercial: emptySource(),
    inventory: emptySource(),
    crm: emptySource(),
    audit: emptySource(),
    subscribers: emptySource(),
    cutoff: emptySource(),
    provisioning: emptySource(),
    replenishment: emptySource(),
  };
}

function assignSource(
  state: DashboardSourcesState,
  id: DashboardDataSourceId,
  value: { status: LoadStatus; data: unknown; error: string | null; lastSuccessAt: string | null },
): void {
  // Indexación heterogénea del fan-out: el discriminante es `id`.
  (state as Record<DashboardDataSourceId, SourceState<unknown>>)[id] = value;
}

const FORBIDDEN_SUMMARY_MESSAGE = 'No tienes acceso a este resumen.';

function mapSourceError(error: unknown, fallback: string): string {
  const candidate =
    error instanceof ApiError
      ? error
      : error instanceof Error && typeof (error as Error & { status?: unknown }).status === 'number'
        ? (error as Error & { status: number })
        : null;
  if (candidate) {
    if (candidate.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente.';
    if (candidate.status === 403) return FORBIDDEN_SUMMARY_MESSAGE;
    return candidate.message || fallback;
  }
  return fallback;
}

function formatLastReadAt(iso: string | null): string {
  if (!iso) return 'Sin lectura aún';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Sin lectura aún';
  return new Intl.DateTimeFormat('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function toSummaryTenant(tenant: TenantSelf): DashboardSummaryTenant {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    contactEmail: tenant.contactEmail,
    legalName: tenant.legalName,
    nit: tenant.nit,
    city: tenant.city,
    department: tenant.department,
    countryCode: tenant.countryCode,
    phone: tenant.phone,
    website: tenant.website,
    createdAt: tenant.createdAt,
  };
}

function commercialAttentionReasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    expiring_soon: 'Vence pronto',
    near_use_limit: 'Cerca del cupo de usos',
    missing_current_price: 'Sin precio vigente',
    bundle_inactive_items: 'Combo con elementos inactivos',
    tax_rules_coverage_gap: 'Cobertura tributaria incompleta',
  };
  return labels[reason] ?? 'Requiere revisión';
}

function openPipelineCount(pipeline: CrmPipelineSummary | null): number | null {
  if (!pipeline) return null;
  let sum = 0;
  for (const [status, count] of Object.entries(pipeline.data)) {
    if (!CLOSED_PIPELINE_STATUSES.has(status)) {
      sum += count;
    }
  }
  return sum;
}

function metricValue(metricId: DashboardMetricId, sources: DashboardSourcesState): number | null {
  switch (metricId) {
    case 'P-1':
      return sources.subscribers.data?.active ?? null;
    case 'I-1':
      return sources.wfm.data?.todayCount ?? null;
    case 'I-2':
      return sources.wfm.data?.pendingInbox?.readyToScheduleCount ?? null;
    case 'I-3':
      return sources.assurance.data?.openCount ?? null;
    case 'I-4':
      return sources.assurance.data?.atRiskCount ?? null;
    case 'I-5':
      return sources.commercial.data?.missingCurrentPriceCount ?? null;
    case 'I-6':
      return sources.commercial.data?.offersAtRiskCount ?? null;
    case 'I-7':
      return openPipelineCount(sources.crm.data);
    default: {
      const _exhaustive: never = metricId;
      return _exhaustive;
    }
  }
}

function metricDelta(
  metricId: DashboardMetricId,
  sources: DashboardSourcesState,
): { label: string; tone: 'warning' | 'danger' | 'neutral' | 'progress' } | undefined {
  if (metricId === 'I-1') {
    const overdue = sources.wfm.data?.overdueCount ?? 0;
    if (overdue > 0) return { label: `${overdue} vencidas`, tone: 'danger' };
    const today = sources.wfm.data?.todayCount ?? 0;
    if (today > 0) return { label: 'Sin vencidas', tone: 'progress' };
  }
  if (metricId === 'I-2') {
    const overdueSla = sources.wfm.data?.pendingInbox?.overdueSlaCount ?? 0;
    if (overdueSla > 0) return { label: `${overdueSla} con atención vencida`, tone: 'warning' };
  }
  if (metricId === 'I-3') {
    const breached = sources.assurance.data?.breachedCount ?? 0;
    if (breached > 0) return { label: `${breached} fuera de tiempo`, tone: 'danger' };
    const atRisk = sources.assurance.data?.atRiskCount ?? 0;
    if (atRisk > 0) return { label: `${atRisk} en riesgo`, tone: 'warning' };
  }
  if (metricId === 'I-4') {
    const breached = sources.assurance.data?.breachedCount ?? 0;
    if (breached > 0) return { label: `${breached} incumplidos`, tone: 'danger' };
  }
  return undefined;
}

/** Frase que interpreta la cifra con datos de la misma fuente. */
function metricHint(
  metricId: DashboardMetricId,
  sources: DashboardSourcesState,
): string | undefined {
  const n = formatDashboardNumber;
  switch (metricId) {
    case 'P-1': {
      const data = sources.subscribers.data;
      return data ? `${n(data.suspended)} suspendidos` : undefined;
    }
    case 'I-1': {
      const data = sources.wfm.data;
      return data
        ? `${n(data.enRouteCount)} en ruta · ${n(data.upcomingCount)} en los próximos 7 días`
        : undefined;
    }
    case 'I-2': {
      const inbox = sources.wfm.data?.pendingInbox;
      return inbox ? `${n(inbox.totalOpen)} abiertas en la bandeja` : undefined;
    }
    case 'I-3': {
      const data = sources.assurance.data;
      return data ? `${n(data.resolvedTodayCount)} resueltos hoy` : undefined;
    }
    case 'I-5': {
      const data = sources.commercial.data;
      return data ? `${n(data.catalogActiveCount)} en el catálogo activo` : undefined;
    }
    case 'I-7': {
      const data = sources.crm.data;
      return data ? `${n(data.total)} registradas en total` : undefined;
    }
    case 'I-4':
    case 'I-6':
      return undefined;
    default: {
      const _exhaustive: never = metricId;
      return _exhaustive;
    }
  }
}

/** Mini visual de la celda; solo con dato real de la misma fuente. */
function metricVisual(metricId: DashboardMetricId, sources: DashboardSourcesState): ReactNode {
  if (metricId === 'P-1' && sources.subscribers.data) {
    return (
      <DashboardStackBar
        segments={subscriberBaseSegments(sources.subscribers.data)}
        ariaLabel="Base de suscriptores"
      />
    );
  }
  if (metricId === 'I-3' && sources.assurance.data) {
    return (
      <DashboardStackBar
        segments={casePrioritySegments(sources.assurance.data.byPriority)}
        ariaLabel="Casos abiertos por prioridad"
      />
    );
  }
  return null;
}

function metricSourceStatus(
  metricId: DashboardMetricId,
  sources: DashboardSourcesState,
): LoadStatus {
  const def = resolveDashboardMetric(metricId);
  const statuses = def.sources.map((id) => sources[id].status);
  if (statuses.some((s) => s === 'error')) return 'error';
  if (statuses.some((s) => s === 'loading')) return 'loading';
  if (statuses.some((s) => s === 'updating')) return 'updating';
  if (statuses.every((s) => s === 'success' || s === 'idle')) return 'success';
  return 'loading';
}

function buildModuleHealthSnapshot(
  sources: DashboardSourcesState,
  requestedSources: readonly DashboardDataSourceId[],
  todayLocalDate: string,
): ModuleHealthSnapshot {
  return {
    requestedSources: new Set(requestedSources),
    sourceStatus: (id) => sources[id].status,
    todayLocalDate,
    wfm: sources.wfm.data?.pendingInbox
      ? {
          overdueCount: sources.wfm.data.overdueCount,
          readyToScheduleCount: sources.wfm.data.pendingInbox.readyToScheduleCount,
          overdueSlaCount: sources.wfm.data.pendingInbox.overdueSlaCount,
          alertsCount: sources.wfm.data.alerts.length,
        }
      : null,
    assurance: sources.assurance.data
      ? {
          atRiskCount: sources.assurance.data.atRiskCount,
          breachedCount: sources.assurance.data.breachedCount,
        }
      : null,
    commercial: sources.commercial.data
      ? {
          offersAtRiskCount: sources.commercial.data.offersAtRiskCount,
          missingCurrentPriceCount: sources.commercial.data.missingCurrentPriceCount,
        }
      : null,
    inventory: sources.inventory.data
      ? {
          itemsCount: sources.inventory.data.itemsCount,
          totalOnHand: sources.inventory.data.totalOnHand,
        }
      : null,
    configurationAlertCount: sources['tenant-summary'].data
      ? sources['tenant-summary'].data.alerts.length
      : null,
  };
}

/** Cifra de cada fila de la cola de atención; `null` = la fuente no entregó el dato. */
function attentionCounts(
  sources: DashboardSourcesState,
): Partial<Record<DashboardAttentionId, number | null>> {
  const wfm = sources.wfm.data;
  const assurance = sources.assurance.data;
  const commercial = sources.commercial.data;
  return {
    'cases-breached': assurance?.breachedCount ?? null,
    'cases-at-risk': assurance?.atRiskCount ?? null,
    'visits-overdue': wfm?.overdueCount ?? null,
    'requests-overdue': wfm?.pendingInbox?.overdueSlaCount ?? null,
    'requests-ready': wfm?.pendingInbox?.readyToScheduleCount ?? null,
    'offers-at-risk': commercial?.offersAtRiskCount ?? null,
    'plans-without-price': commercial?.missingCurrentPriceCount ?? null,
    'cutoff-today': sources.cutoff.data,
    'provisioning-failed': sources.provisioning.data?.failed ?? null,
    'provisioning-unfinished': sources.provisioning.data?.closedUnprovisioned ?? null,
    'fiscal-incomplete': sources.subscribers.data?.fiscalIncomplete ?? null,
    'stock-below-minimum': sources.replenishment.data,
    'configuration-pending': sources['tenant-summary'].data?.alerts.length ?? null,
  };
}

/** Etapas abiertas del embudo con su conteo, para la card de Oportunidades. */
function openPipelineByStatus(pipeline: CrmPipelineSummary | null) {
  if (!pipeline) return null;
  const openByStatus: Record<string, number> = {};
  for (const [status, count] of Object.entries(pipeline.data)) {
    if (!CLOSED_PIPELINE_STATUSES.has(status)) openByStatus[status] = count;
  }
  return { openByStatus, open: openPipelineCount(pipeline) ?? 0 };
}

/** Áreas cuyo estado ya deriva `dashboard-module-health`. */
const MODULE_HEALTH_AREA_IDS = ['help-desk', 'scheduling', 'opportunities', 'inventory'] as const;

function subscribersAreaHealth(sources: DashboardSourcesState): DashboardAreaHealth {
  const { label, href } = DASHBOARD_AREA_REGISTRY.subscribers;
  const data = sources.subscribers.data;
  if (!data) return { label, status: 'unknown', href };
  if (data.fiscalIncomplete > 0) {
    return { label, status: 'attention', href: `${href}?queue=fiscalIncomplete` };
  }
  if (data.contactPending > 0) {
    return { label, status: 'attention', href: `${href}?queue=contactPending` };
  }
  return { label, status: 'ok', href };
}

function provisioningAreaHealth(sources: DashboardSourcesState): DashboardAreaHealth {
  const { label, href } = DASHBOARD_AREA_REGISTRY.provisioning;
  const data = sources.provisioning.data;
  if (!data) return { label, status: 'unknown', href };
  if (data.failed > 0) return { label, status: 'at-risk', href: `${href}?queue=FAILED` };
  if (data.closedUnprovisioned > 0) {
    return { label, status: 'attention', href: `${href}?queue=CLOSED_UNPROVISIONED` };
  }
  return { label, status: 'ok', href };
}

interface DashboardCacheEntry {
  role: UserRole;
  slug: string;
  sources: DashboardSourcesState;
  lastFetchedAt: string | null;
  partialStale: boolean;
}

let dashboardSessionCache: DashboardCacheEntry | null = null;

async function fetchSource(sourceId: DashboardDataSourceId, slug: string): Promise<unknown> {
  switch (sourceId) {
    case 'public-branding':
      return tenantSelfApi.getPublicBranding(slug);
    case 'tenant-summary':
      return dashboardApi.getSummary(slug);
    case 'tenant-me': {
      const [tenant, settings] = await Promise.all([
        tenantSelfApi.getMe(slug),
        tenantSelfApi.getSettings(slug),
      ]);
      return { tenant, settings };
    }
    case 'wfm':
      return wfmApi.dashboard.getSummary(slug);
    case 'assurance':
      return assuranceApi.dashboard.getSummary(slug);
    case 'commercial':
      return commercialApi.getDashboardSummary(slug);
    case 'inventory':
      return inventoryApi.dashboard(slug);
    case 'crm':
      return crmApi.getPipelineSummary(slug);
    case 'audit':
      return loadAuditFeed({ slug, force: true });
    case 'subscribers':
      return subscribersApi.queueCounts(slug);
    case 'cutoff': {
      // Solo interesa el total: se pide la página mínima.
      const agenda = await billingCyclesApi.cutoffAgenda({ date: toLocalDayKey(), limit: 1 }, slug);
      return agenda.meta.total;
    }
    case 'provisioning': {
      // Solo interesan los totales de cada cola.
      const [inExecution, failed, closedUnprovisioned] = await Promise.all(
        (['IN_EXECUTION', 'FAILED', 'CLOSED_UNPROVISIONED'] as const).map((queue) =>
          networkApi.listProvisioningInbox({ queue, limit: 1 }, slug),
        ),
      );
      return {
        inExecution: inExecution!.meta.total,
        failed: failed!.meta.total,
        closedUnprovisioned: closedUnprovisioned!.meta.total,
      };
    }
    case 'replenishment':
      return (await inventoryApi.listReplenishmentSuggestions(slug)).length;
    default: {
      const _exhaustive: never = sourceId;
      return _exhaustive;
    }
  }
}

function IdentityOnlyCard({ branding }: { branding: TenantPublicBranding | null }) {
  const name = branding?.displayName ?? branding?.productName ?? 'Tu empresa';
  return (
    <PortalPanel
      compact
      title={name}
      description="Identidad visible de tu organización"
      actions={
        <Link href="/dashboard/profile" className={portalInlineTextLinkClassName}>
          Ver mi perfil
        </Link>
      }
    >
      <p className="text-sm text-gray-600 dark:text-gray-400">
        El detalle operativo vive en Configuración cuando tu perfil lo permita.
      </p>
    </PortalPanel>
  );
}

function BlockError({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <PortalPanel compact title={title}>
      <PortalAlert
        variant="error"
        title={message}
        live="polite"
        action={
          <button type="button" onClick={onRetry} className={portalInlineTextLinkClassName}>
            Reintentar
          </button>
        }
      />
    </PortalPanel>
  );
}

function BlockLoading({ title, rows = 3 }: { title: string; rows?: number }) {
  return (
    <PortalPanel compact title={title} busy>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <PortalSkeletonBlock key={i} className="h-12 rounded-xl" />
        ))}
      </div>
    </PortalPanel>
  );
}

function BlockEmpty({
  title,
  description,
  action,
}: {
  title?: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <PortalEmptyState
      embedded
      title={title ?? 'Sin pendientes'}
      description={description}
      action={action}
    />
  );
}

function fieldAlertSeverityLabel(severity: 'critical' | 'warning' | 'info'): string {
  if (severity === 'critical') return 'Crítico';
  if (severity === 'warning') return 'Atención';
  return 'Informativo';
}

const FIELD_ALERT_SEVERITY_ORDER: Record<WfmDashboardAlert['severity'], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/** Orden estable de atención: el riesgo más alto aparece primero. */
export function sortFieldAlertsBySeverity(
  alerts: readonly WfmDashboardAlert[],
): WfmDashboardAlert[] {
  return alerts
    .map((alert, index) => ({ alert, index }))
    .sort(
      (left, right) =>
        FIELD_ALERT_SEVERITY_ORDER[left.alert.severity] -
          FIELD_ALERT_SEVERITY_ORDER[right.alert.severity] || left.index - right.index,
    )
    .map(({ alert }) => alert);
}

function fieldAlertSeverityVariant(
  severity: 'critical' | 'warning' | 'info',
): 'error' | 'warning' | 'info' {
  if (severity === 'critical') return 'error';
  if (severity === 'warning') return 'warning';
  return 'info';
}

function FieldAttentionBlock({
  sources,
  onRetry,
  maxItems = 5,
}: {
  sources: DashboardSourcesState;
  onRetry: () => void;
  maxItems?: number;
}) {
  const state = sources.wfm;
  const title = resolveDashboardBlock('field-attention').title;
  if (state.status === 'loading' && !state.data) {
    return <BlockLoading title={title} rows={3} />;
  }
  if (state.status === 'error' && !state.data) {
    return (
      <BlockError
        title={title}
        message="No pudimos cargar el resumen de operaciones de campo. Reintenta en unos minutos."
        onRetry={onRetry}
      />
    );
  }
  const alerts = sortFieldAlertsBySeverity(state.data?.alerts ?? []);
  return (
    <PortalPanel compact title={title}>
      {state.status === 'updating' ? (
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
          Actualizando
        </p>
      ) : null}
      {alerts.length === 0 ? (
        <BlockEmpty
          title="Sin avisos de campo"
          description="No hay avisos pendientes en operaciones de campo. Revisa la agenda si necesitas programar visitas."
          action={
            <Link href="/dashboard/scheduling/agenda" className={portalInlineTextLinkClassName}>
              Ver la agenda de hoy
            </Link>
          }
        />
      ) : (
        <div className={portalDataTableShellClassName}>
          <table className="w-full min-w-[20rem] text-left" aria-label="Avisos de campo">
            <thead>
              <tr className={portalDataTableHeadRowClassName}>
                <PortalDataTableHead>Aviso</PortalDataTableHead>
                <PortalDataTableHead>Estado</PortalDataTableHead>
              </tr>
            </thead>
            <tbody className={portalDataTableBodyClassName}>
              {alerts.slice(0, maxItems).map((alert) => (
                <tr key={alert.id} className={portalTableRowHoverClassName}>
                  <td className={portalDataTableCellClassName}>
                    <Link
                      href="/dashboard/scheduling/agenda"
                      className={`block min-h-11 ${interactiveFocusClassName}`}
                    >
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {alert.title}
                      </span>
                      <span className="mt-1 block text-xs text-gray-600 dark:text-gray-400">
                        {alert.description}
                      </span>
                    </Link>
                  </td>
                  <td className={portalDataTableCellClassName}>
                    <Badge variant={fieldAlertSeverityVariant(alert.severity)}>
                      {fieldAlertSeverityLabel(alert.severity)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PortalPanel>
  );
}

function CommercialAttentionBlock({
  sources,
  onRetry,
  highlight,
  accountantOnly,
  headingRef,
}: {
  sources: DashboardSourcesState;
  onRetry: () => void;
  highlight?: boolean;
  accountantOnly?: boolean;
  headingRef?: Ref<HTMLHeadingElement> | undefined;
}) {
  const state = sources.commercial;
  const title = resolveDashboardBlock('commercial-attention').title;
  const headingProps = {
    id: 'commercial-attention',
    titleTabIndex: -1 as const,
    titleRef: headingRef,
  };
  if (state.status === 'loading' && !state.data) {
    return <BlockLoading title={title} rows={5} />;
  }
  if (state.status === 'error' && !state.data) {
    return (
      <BlockError
        title={title}
        message="No pudimos cargar la atención comercial. Reintenta en unos minutos."
        onRetry={onRetry}
      />
    );
  }

  const priceReasons = new Set([
    'missing_current_price',
    'tax_rules_coverage_gap',
    'bundle_inactive_items',
  ]);
  let items = state.data?.attentionItems ?? [];
  if (accountantOnly) {
    items = items.filter((item) => priceReasons.has(item.reason));
  }
  items = items.slice(0, 5);

  return (
    <PortalPanel compact title={title} {...headingProps}>
      {highlight ? (
        <p
          role="status"
          aria-live="polite"
          aria-label="Atención comercial. Revisa las ofertas en riesgo."
          className="mb-3 text-xs font-medium text-amber-700 dark:text-amber-300"
        >
          Atención comercial. Revisa las ofertas en riesgo.
        </p>
      ) : null}
      {state.status === 'updating' ? (
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
          Actualizando
        </p>
      ) : null}
      {items.length === 0 ? (
        (state.data?.catalogActiveCount ?? 0) === 0 ? (
          <BlockEmpty
            title="Aún no has creado tu catálogo"
            description="Crea el primer plan para empezar a vender y facturar sin huecos."
            action={
              <Link
                href="/dashboard/commercial?tab=plans"
                className={portalInlineTextLinkClassName}
              >
                Crear el primer plan
              </Link>
            }
          />
        ) : (
          <BlockEmpty
            title="Tu catálogo está completo"
            description="No hay ofertas que requieran atención ahora. Puedes revisar el catálogo cuando quieras."
            action={
              <Link href="/dashboard/commercial" className={portalInlineTextLinkClassName}>
                Ver el catálogo
              </Link>
            }
          />
        )
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <PortalNavListRow
                href={`/dashboard/commercial?tab=${encodeURIComponent(item.destinoTab)}&focus=${encodeURIComponent(item.id)}`}
                title={item.name}
                meta={commercialAttentionReasonLabel(item.reason)}
              />
            </li>
          ))}
        </ul>
      )}
    </PortalPanel>
  );
}

function renderDashboardBlock({
  blockId,
  sources,
  composition,
  highlightCommercial,
  onRetrySource,
  role,
  commercialHeadingRef,
}: {
  blockId: DashboardBlockId;
  sources: DashboardSourcesState;
  composition: DashboardRoleComposition;
  highlightCommercial: boolean;
  onRetrySource: (sourceId: DashboardDataSourceId) => void;
  role: UserRole;
  commercialHeadingRef?: Ref<HTMLHeadingElement> | undefined;
}) {
  switch (blockId) {
    case 'field-attention':
      return (
        <FieldAttentionBlock
          key={blockId}
          sources={sources}
          maxItems={role === UserRole.SUPPORT ? 3 : 5}
          onRetry={() => onRetrySource('wfm')}
        />
      );
    case 'commercial-attention':
      return (
        <CommercialAttentionBlock
          key={blockId}
          sources={sources}
          highlight={highlightCommercial}
          accountantOnly={composition.primaryActionId === 'review-plans-without-price'}
          headingRef={commercialHeadingRef}
          onRetry={() => onRetrySource('commercial')}
        />
      );
    case 'change-history': {
      const audit = sources.audit;
      return (
        <section key={blockId} aria-label={resolveDashboardBlock(blockId).title}>
          <RecentActivityPanel
            entries={audit.data}
            status={audit.status}
            error={audit.error}
            onRetry={() => onRetrySource('audit')}
            minimized={role === UserRole.AUDITOR}
          />
        </section>
      );
    }
    default: {
      const _exhaustive: never = blockId;
      return _exhaustive;
    }
  }
}

function ModuleHealthBand({
  moduleHealthIds,
  sources,
  requestedSources,
  today,
  firstLoadPending,
  overflowOpen,
  onToggleOverflow,
  onRetrySource,
}: {
  moduleHealthIds: readonly DashboardModuleHealthId[];
  sources: DashboardSourcesState;
  requestedSources: readonly DashboardDataSourceId[];
  today: string;
  firstLoadPending: boolean;
  overflowOpen: boolean;
  onToggleOverflow: () => void;
  onRetrySource: (sourceId: DashboardDataSourceId) => void;
}) {
  const snapshot = buildModuleHealthSnapshot(sources, requestedSources, today);
  const { visibleIds, overflowIds } = splitDashboardModuleHealthIds(moduleHealthIds);
  const renderedIds = overflowOpen ? [...visibleIds, ...overflowIds] : visibleIds;
  const chips = renderedIds.map((id) => resolveModuleHealthChip(id, snapshot));
  const failedSources = new Set<DashboardDataSourceId>();
  for (const chip of chips) {
    if (chip.state === 'error') {
      for (const sourceId of chip.sources) failedSources.add(sourceId);
    }
  }

  return (
    <section aria-label="Salud de la operación" className="space-y-2">
      <p className="portal-eyebrow">Salud de la operación</p>
      {failedSources.size > 0 ? (
        <PortalAlert
          variant="error"
          title="No pudimos cargar el estado de algunos módulos. Reintenta."
          live="polite"
          action={
            <button
              type="button"
              className={portalInlineTextLinkClassName}
              onClick={() => {
                for (const sourceId of failedSources) onRetrySource(sourceId);
              }}
            >
              Reintentar
            </button>
          }
        />
      ) : null}
      {firstLoadPending ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
          {Array.from({ length: Math.min(4, moduleHealthIds.length) || 4 }).map((_, index) => (
            <PortalSkeletonBlock key={index} className="h-11 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {chips.map((chip) => (
            <PortalModuleHealthChip
              key={chip.id}
              label={chip.label}
              status={chip.status}
              value={chip.value}
              state={chip.state}
              {...(chip.state === 'error' ? {} : { href: chip.href })}
            />
          ))}
        </div>
      )}
      {overflowIds.length > 0 ? (
        <button
          type="button"
          className={portalInlineTextLinkClassName}
          aria-expanded={overflowOpen}
          onClick={onToggleOverflow}
        >
          {overflowOpen ? 'Ocultar módulos' : 'Ver más módulos'}
        </button>
      ) : null}
    </section>
  );
}

/**
 * Cliente del inicio empresarial del portal.
 * Composición por rol + fan-out `Promise.allSettled` con degradación por bloque.
 * HLD-MOD02-DASHBOARD-EMPRESA-v2.0 §4.4 / §5 · UX spec §4 / §9
 */
export function DashboardClient() {
  const { user } = useAuth();
  const role = isUserRole(user?.role) ? user.role : null;
  const composition = role ? getDashboardRoleComposition(role) : null;

  const [sources, setSources] = useState<DashboardSourcesState>(() => createInitialSources());
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [partialStale, setPartialStale] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [highlightCommercial, setHighlightCommercial] = useState(false);
  const [moduleHealthOverflowOpen, setModuleHealthOverflowOpen] = useState(false);
  const lastFetchedAtRef = useRef<string | null>(null);
  const commercialHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const loadSources = useCallback(
    async (options: {
      sourceIds: readonly DashboardDataSourceId[];
      silent: boolean;
      slug: string;
      role: UserRole;
    }) => {
      const { sourceIds, silent, slug, role: loadRole } = options;
      if (sourceIds.length === 0) {
        setInitialLoadDone(true);
        return;
      }

      setSources((prev) => {
        const next: DashboardSourcesState = { ...prev };
        for (const id of sourceIds) {
          const current = prev[id];
          const patch = {
            data: current.data,
            error: null,
            lastSuccessAt: current.lastSuccessAt,
            status: (silent && current.data ? 'updating' : 'loading') as LoadStatus,
          };
          assignSource(next, id, patch);
        }
        return next;
      });

      const settled = await Promise.allSettled(
        sourceIds.map(async (id) => ({ id, data: await fetchSource(id, slug) })),
      );

      const fetchedAt = new Date().toISOString();
      const allSucceeded = settled.every((result) => result.status === 'fulfilled');
      setSources((prev) => {
        const next: DashboardSourcesState = { ...prev };
        for (let i = 0; i < settled.length; i++) {
          const result = settled[i]!;
          const sourceId = sourceIds[i]!;
          if (result.status === 'fulfilled') {
            assignSource(next, sourceId, {
              status: 'success',
              data: result.value.data,
              error: null,
              lastSuccessAt: fetchedAt,
            });
          } else {
            const previous = prev[sourceId];
            assignSource(next, sourceId, {
              status: 'error',
              data: previous.data,
              error: mapSourceError(
                result.reason,
                'No pudimos cargar este resumen. Reintenta en unos minutos.',
              ),
              lastSuccessAt: previous.lastSuccessAt,
            });
          }
        }
        const previousComplete = lastFetchedAtRef.current;
        const nextLastFetchedAt = allSucceeded ? fetchedAt : previousComplete;
        const nextPartialStale = !allSucceeded && Boolean(nextLastFetchedAt);
        // R-5 · snapshot de sesión para volver con «Atrás» sin refetch.
        dashboardSessionCache = {
          role: loadRole,
          slug,
          sources: next,
          lastFetchedAt: nextLastFetchedAt,
          partialStale: nextPartialStale,
        };
        return next;
      });

      if (allSucceeded) {
        lastFetchedAtRef.current = fetchedAt;
        setLastFetchedAt(fetchedAt);
        setPartialStale(false);
      } else {
        setPartialStale(Boolean(lastFetchedAtRef.current));
      }
      setInitialLoadDone(true);
    },
    [],
  );

  const retrySource = useCallback(
    (sourceId: DashboardDataSourceId) => {
      if (!role) return;
      const slug = resolveTenantSlug().slug;
      if (!slug) return;
      void loadSources({ sourceIds: [sourceId], silent: true, slug, role });
    },
    [loadSources, role],
  );

  useEffect(() => {
    if (!role) {
      setInitialLoadDone(true);
      return;
    }

    const slug = resolveTenantSlug().slug;
    if (!slug) {
      setInitialLoadDone(true);
      return;
    }

    const cached = dashboardSessionCache;
    if (cached && cached.role === role && cached.slug === slug) {
      // R-5 · restaurar último estado leído; no disparar red.
      setSources(cached.sources);
      lastFetchedAtRef.current = cached.lastFetchedAt;
      setLastFetchedAt(cached.lastFetchedAt);
      setPartialStale(cached.partialStale);
      setInitialLoadDone(true);
      return;
    }

    const sourceIds = resolveDashboardDataSources(role);
    void loadSources({ sourceIds, silent: false, slug, role });
  }, [loadSources, role]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible' || !role || !lastFetchedAt) return;
      const elapsed = Date.now() - new Date(lastFetchedAt).getTime();
      if (elapsed < TAB_REFRESH_MS) return;
      const slug = resolveTenantSlug().slug;
      if (!slug) return;
      const operational = resolveDashboardDataSources(role).filter(
        (id) => id !== 'public-branding' && id !== 'tenant-summary' && id !== 'tenant-me',
      );
      if (operational.length === 0) return;
      void loadSources({ sourceIds: operational, silent: true, slug, role });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [lastFetchedAt, loadSources, role]);

  useLayoutEffect(() => {
    if (!highlightCommercial) return;
    const heading = commercialHeadingRef.current;
    if (!heading) return;
    heading.focus();
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion && typeof heading.scrollIntoView === 'function') {
      heading.scrollIntoView({ block: 'start' });
    }
  }, [highlightCommercial]);

  if (!user || !role || !composition) {
    return (
      <div className="space-y-4">
        <PageHeader title="Inicio" subtitle="No pudimos determinar tu perfil de acceso." />
      </div>
    );
  }

  const branding = sources['public-branding'].data;
  const summaryTenant = sources['tenant-summary'].data?.tenant;
  const meTenant = sources['tenant-me'].data
    ? toSummaryTenant(sources['tenant-me'].data.tenant)
    : null;
  const operationalTenant = summaryTenant ?? meTenant;
  const operationalSettings =
    sources['tenant-summary'].data?.settings ?? sources['tenant-me'].data?.settings ?? null;

  const companyTitle =
    operationalTenant?.name ?? branding?.displayName ?? branding?.productName ?? 'Inicio';

  const firstLoadPending = !initialLoadDone;
  const today = toLocalDayKey();

  const requestedSources = resolveDashboardDataSources(role);
  const hasAttention = composition.attentionIds.length > 0;
  // Sin permiso sobre una fuente no es un fallo: esa fila no se compone para esta persona.
  const attentionQueue = resolveAttentionQueue({
    allowedIds: composition.attentionIds.filter(
      (id) => sources[DASHBOARD_ATTENTION_SOURCES[id]].error !== FORBIDDEN_SUMMARY_MESSAGE,
    ),
    sourceStatus: (id) => sources[id].status,
    counts: attentionCounts(sources),
    todayLocalDate: today,
  });

  const healthSnapshot = buildModuleHealthSnapshot(sources, requestedSources, today);
  const areaHealth = {
    ...Object.fromEntries(
      MODULE_HEALTH_AREA_IDS.map((id) => {
        const chip = resolveModuleHealthChip(id, healthSnapshot);
        return [id, { label: chip.label, status: chip.status, href: chip.href }];
      }),
    ),
    subscribers: subscribersAreaHealth(sources),
    provisioning: provisioningAreaHealth(sources),
  } as Record<DashboardAreaId, DashboardAreaHealth>;

  const pulseCells: DashboardPulseCell[] = composition.metricIds.map((metricId) => {
    const def = resolveDashboardMetric(metricId);
    const status = metricSourceStatus(metricId, sources);
    const href = def.buildHref(today);
    return {
      id: metricId,
      label: def.label,
      value: metricValue(metricId, sources),
      delta: metricDelta(metricId, sources),
      hint: metricHint(metricId, sources),
      visual: metricVisual(metricId, sources),
      state: status === 'loading' ? 'loading' : status === 'error' ? 'error' : 'idle',
      updating: status === 'updating',
      href,
      // I-6 no tiene filtro único en destino: enfoca la atención comercial del propio inicio.
      onClick: href ? undefined : () => setHighlightCommercial(true),
      onRetry: () => {
        for (const sourceId of def.sources) retrySource(sourceId);
      },
    };
  });

  const hasAreas = composition.areaIds.length > 0;
  const hasSupport = composition.supportBlockIds.length > 0;

  const renderBlock = (blockId: DashboardBlockId) =>
    renderDashboardBlock({
      blockId,
      sources,
      composition,
      highlightCommercial,
      onRetrySource: retrySource,
      role,
      commercialHeadingRef,
    });

  return (
    <div className="space-y-4">
      {/* B0 · Identidad (U-B0bis: sin controles en el encabezado) */}
      <PageHeader
        title={companyTitle}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              Última lectura:{' '}
              {lastFetchedAt ? (
                <time dateTime={lastFetchedAt} className="font-mono tabular-nums">
                  {formatLastReadAt(lastFetchedAt)}
                </time>
              ) : (
                formatLastReadAt(lastFetchedAt)
              )}
            </span>
            {partialStale ? (
              <span role="status" className="text-amber-700 dark:text-amber-300">
                Algunos datos no se actualizaron. Revisa los avisos.
              </span>
            ) : null}
            {Object.values(sources).some((s) => s.status === 'updating') ? (
              <span
                className="text-iwana-secondary-700 dark:text-iwana-secondary-300"
                aria-live="polite"
              >
                Actualizando
              </span>
            ) : null}
          </span>
        }
      />

      {/* B1 · Pulso: una superficie con hasta cinco celdas */}
      <DashboardPulse cells={pulseCells} loading={firstLoadPending} />

      {/* Chips de navegación: solo roles de ejecución en campo */}
      {composition.moduleHealthIds.length > 0 ? (
        <ModuleHealthBand
          moduleHealthIds={composition.moduleHealthIds}
          sources={sources}
          requestedSources={requestedSources}
          today={today}
          firstLoadPending={firstLoadPending}
          overflowOpen={moduleHealthOverflowOpen}
          onToggleOverflow={() => setModuleHealthOverflowOpen((open) => !open)}
          onRetrySource={retrySource}
        />
      ) : null}

      {/* B2 · Por área (8) + Requiere tu atención (4) */}
      {hasAttention || hasAreas ? (
        <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-12">
          {hasAttention ? (
            // Primera en el DOM (lectura y móvil); a la derecha en escritorio.
            <div className={hasAreas ? 'xl:order-last xl:col-span-4' : 'xl:col-span-12'}>
              <DashboardAttentionQueue
                queue={attentionQueue}
                onRetry={() => {
                  for (const sourceId of attentionQueue.failedSources) retrySource(sourceId);
                }}
              />
            </div>
          ) : null}
          {hasAreas ? (
            <div className={hasAttention ? 'xl:col-span-8' : 'xl:col-span-12'}>
              <DashboardAreaCards
                areaIds={composition.areaIds}
                health={areaHealth}
                assurance={sources.assurance}
                wfm={sources.wfm}
                pipeline={{
                  status: sources.crm.status,
                  data: openPipelineByStatus(sources.crm.data),
                  error: sources.crm.error,
                }}
                subscribers={sources.subscribers}
                provisioning={sources.provisioning}
                inventory={sources.inventory}
                onRetrySource={retrySource}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* B4 · Detalle del rol (7) + historial (5) */}
      {composition.dominantBlockId || hasSupport ? (
        <div
          className={cn(
            'grid grid-cols-1 items-start gap-3',
            composition.dominantBlockId && hasSupport && 'xl:grid-cols-12',
          )}
        >
          {composition.dominantBlockId ? (
            <div className={hasSupport ? 'xl:col-span-7' : undefined}>
              {renderBlock(composition.dominantBlockId)}
            </div>
          ) : null}
          {hasSupport ? (
            <div
              className={cn('flex flex-col gap-3', composition.dominantBlockId && 'xl:col-span-5')}
            >
              {composition.supportBlockIds.map(renderBlock)}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Identidad de la empresa: solo roles sin composición operativa */}
      {composition.showOperationalTenantCard ? (
        <section aria-label="Estado de la empresa">
          {(() => {
            const requested = new Set(requestedSources);
            const waitsForMe = requested.has('tenant-me');
            const waitsForSummary = requested.has('tenant-summary');
            const meStatus = sources['tenant-me'].status;
            const summaryStatus = sources['tenant-summary'].status;
            const brandingStatus = sources['public-branding'].status;
            const hasOperational = Boolean(operationalTenant && operationalSettings);
            const sourcePending = (status: typeof meStatus) =>
              status === 'idle' || status === 'loading';
            // Solo esperar fuentes que el rol pide. Vista base no llama tenant-me
            // ni summary: si se espera idle, la ficha queda en esqueleto para siempre.
            const b3Pending =
              !hasOperational &&
              (waitsForMe || waitsForSummary
                ? (waitsForMe && sourcePending(meStatus)) ||
                  (waitsForSummary && sourcePending(summaryStatus))
                : sourcePending(brandingStatus));
            const b3Failed =
              !hasOperational &&
              (waitsForMe || waitsForSummary
                ? (waitsForMe && meStatus === 'error') ||
                  (waitsForSummary && summaryStatus === 'error')
                : brandingStatus === 'error');

            if (b3Pending) {
              return <BlockLoading title="Estado de la empresa" rows={2} />;
            }
            if (b3Failed) {
              return (
                <BlockError
                  title="Estado de la empresa"
                  message="No pudimos cargar el resumen de tu empresa. Reintenta en unos minutos."
                  onRetry={() => {
                    if (waitsForSummary) retrySource('tenant-summary');
                    if (waitsForMe) retrySource('tenant-me');
                    if (!waitsForMe && !waitsForSummary) retrySource('public-branding');
                  }}
                />
              );
            }
            if (operationalTenant && operationalSettings) {
              return (
                <TenantSummaryCard tenant={operationalTenant} settings={operationalSettings} />
              );
            }
            return <IdentityOnlyCard branding={branding} />;
          })()}
        </section>
      ) : null}
    </div>
  );
}

/** Expone limpieza de caché de sesión para pruebas. */
export function __resetDashboardSessionCacheForTests(): void {
  dashboardSessionCache = null;
}
