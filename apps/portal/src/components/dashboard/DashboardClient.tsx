// apps/portal/src/components/dashboard/DashboardClient.tsx
'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { ExpedienteStatus, UserRole } from '@iwana/shared';
import { MoreHorizontal, RefreshCw } from 'lucide-react';
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from '@iwana/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  PortalAlert,
  PortalDashboardMetric,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
  interactiveFocusClassName,
  portalInlineTextLinkClassName,
} from '@/components/shared/portal-ui';
import { useAuth } from '@/components/auth/AuthProvider';
import { resolveTenantSlug } from '@/lib/tenant-resolution';
import { loadAuditFeed } from '@/lib/audit-feed-cache';
import {
  ApiError,
  assuranceApi,
  commercialApi,
  crmApi,
  dashboardApi,
  inventoryApi,
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
import {
  getAssuranceTicketPriorityLabel,
  getAssuranceTicketTypeLabel,
} from '@/components/assurance/assurance-labels';
import { formatExpedienteStatus } from '@/components/crm/expedientes/expediente-ui';
import { TenantSummaryCard } from './TenantSummaryCard';
import { OnboardingAlerts } from './OnboardingAlerts';
import { RecentActivityPanel } from './RecentActivityPanel';
import { QuickActionsPanel } from './QuickActionsPanel';
import {
  getDashboardRoleComposition,
  groupDashboardMetricsByDomain,
  isUserRole,
  resolveDashboardAction,
  resolveDashboardBlock,
  resolveDashboardDataSources,
  resolveDashboardMetric,
  resolvePromotedFoldedBlockIds,
  toLocalDayKey,
  type DashboardActionDefinition,
  type DashboardBlockId,
  type DashboardDataSourceId,
  type DashboardMetricId,
  type DashboardMetricSourceStatus,
  type DashboardRoleComposition,
} from './dashboard-role-composition';
import type { OnboardingOperationState } from './OnboardingAlerts';

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

function mapSourceError(error: unknown, fallback: string): string {
  const candidate =
    error instanceof ApiError
      ? error
      : error instanceof Error && typeof (error as Error & { status?: unknown }).status === 'number'
        ? (error as Error & { status: number })
        : null;
  if (candidate) {
    if (candidate.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente.';
    if (candidate.status === 403) return 'No tienes permisos para este bloque.';
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
    case 'I-1':
      return sources.wfm.data?.todayCount ?? null;
    case 'I-2':
      return sources.wfm.data?.pendingInbox.readyToScheduleCount ?? null;
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
): { label: string; tone: 'warning' | 'danger' | 'neutral' } | undefined {
  if (metricId === 'I-1') {
    const overdue = sources.wfm.data?.overdueCount ?? 0;
    if (overdue > 0) return { label: `${overdue} vencidas`, tone: 'danger' };
  }
  if (metricId === 'I-2') {
    const overdueSla = sources.wfm.data?.pendingInbox.overdueSlaCount ?? 0;
    if (overdueSla > 0) return { label: `${overdueSla} con atención vencida`, tone: 'warning' };
  }
  if (metricId === 'I-4') {
    const breached = sources.assurance.data?.breachedCount ?? 0;
    if (breached > 0) return { label: `${breached} incumplidos`, tone: 'danger' };
  }
  return undefined;
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

function resolveOnboardingOperationState(sources: DashboardSourcesState): OnboardingOperationState {
  const operationSources = [sources.commercial, sources.crm, sources.inventory];
  if (
    operationSources.some(
      (source) =>
        source.status === 'idle' || source.status === 'loading' || source.status === 'error',
    )
  ) {
    return 'unknown';
  }

  const universeCounts = [
    sources.commercial.data?.catalogActiveCount,
    sources.crm.data?.total,
    sources.inventory.data?.itemsCount,
  ];
  const availableCounts = universeCounts.filter(
    (count): count is number => typeof count === 'number',
  );
  if (availableCounts.length !== universeCounts.length) return 'unknown';
  return availableCounts.some((count) => count > 0) ? 'active' : 'not-started';
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
    default: {
      const _exhaustive: never = sourceId;
      return _exhaustive;
    }
  }
}

function MetricsSkeleton({
  groups,
}: {
  groups: readonly { label: string; metricIds: readonly string[] }[];
}) {
  return (
    <div className="space-y-6" aria-busy="true">
      {groups.map((group) => (
        <div key={group.label} className="space-y-3">
          <PortalSkeletonBlock className="h-4 w-40 rounded-md" />
          <div
            className={`grid grid-cols-1 gap-4 ${group.metricIds.length > 1 ? 'sm:grid-cols-2' : ''}`}
          >
            {group.metricIds.map((metricId) => (
              <PortalSkeletonBlock key={metricId} className="h-[148px] rounded-3xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function IdentityOnlyCard({ branding }: { branding: TenantPublicBranding | null }) {
  const name = branding?.displayName ?? branding?.productName ?? 'Tu empresa';
  return (
    <PortalPanel title={name} description="Identidad visible de tu organización">
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
    <PortalPanel title={title}>
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

const headerActionClassName =
  'min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium';

function DashboardHeaderActions({
  primary,
  secondary,
  onRefresh,
}: {
  primary: DashboardActionDefinition;
  secondary: DashboardActionDefinition | null;
  onRefresh: () => void;
}) {
  const menuId = useId();
  const overflowTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="flex w-full flex-wrap items-center gap-2 md:justify-end">
      <button
        type="button"
        onClick={onRefresh}
        className={cn(
          headerActionClassName,
          interactiveFocusClassName,
          'hidden border border-gray-200 text-gray-700 hover:bg-gray-50 md:inline-flex dark:border-dark-border dark:text-gray-200 dark:hover:bg-dark-surface-3',
        )}
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Actualizar
      </button>
      <Link
        href={primary.href}
        className={cn(
          headerActionClassName,
          interactiveFocusClassName,
          'inline-flex bg-iwana-primary text-white hover:bg-iwana-primary-600',
        )}
      >
        {primary.label}
      </Link>
      <div className={cn('flex', secondary ? 'md:hidden xl:flex' : 'md:hidden')}>
        <DropdownMenu>
          <DropdownMenuTrigger
            ref={overflowTriggerRef}
            asChild
            aria-label="Más acciones del inicio"
            aria-controls={menuId}
            className={cn(
              headerActionClassName,
              interactiveFocusClassName,
              'inline-flex border border-gray-200 text-gray-700 dark:border-dark-border dark:text-gray-200',
            )}
          >
            <button type="button">
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent id={menuId} align="end" width="w-56">
            <DropdownMenuItem
              className="xl:hidden"
              onClick={() => {
                onRefresh();
                queueMicrotask(() => {
                  overflowTriggerRef.current?.focus();
                });
              }}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Actualizar
            </DropdownMenuItem>
            {secondary ? (
              <DropdownMenuItem asChild>
                <Link href={secondary.href}>{secondary.label}</Link>
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function BlockLoading({ title, rows = 3 }: { title: string; rows?: number }) {
  return (
    <PortalPanel title={title} busy>
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
    <PortalEmptyState title={title ?? 'Sin pendientes'} description={description} action={action} />
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
    <PortalPanel title={title}>
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
        <ul className="divide-y divide-gray-100 dark:divide-dark-border-2">
          {alerts.slice(0, maxItems).map((alert) => (
            <li key={alert.id}>
              <Link
                href="/dashboard/scheduling/agenda"
                className={`flex min-h-11 flex-col gap-1 px-1 py-3 transition-colors hover:bg-iwana-surface-soft/60 dark:hover:bg-dark-surface-3/50 ${interactiveFocusClassName}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{alert.title}</p>
                  <Badge variant={fieldAlertSeverityVariant(alert.severity)}>
                    {fieldAlertSeverityLabel(alert.severity)}
                  </Badge>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">{alert.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PortalPanel>
  );
}

function HelpDeskBlock({
  sources,
  onRetry,
}: {
  sources: DashboardSourcesState;
  onRetry: () => void;
}) {
  const state = sources.assurance;
  const title = resolveDashboardBlock('help-desk').title;
  if (state.status === 'loading' && !state.data) {
    return <BlockLoading title={title} rows={3} />;
  }
  if (state.status === 'error' && !state.data) {
    return (
      <BlockError
        title={title}
        message="No pudimos cargar el resumen de la mesa de ayuda. Reintenta en unos minutos."
        onRetry={onRetry}
      />
    );
  }
  const openCount = state.data?.openCount ?? 0;
  const byPriority = Object.entries(state.data?.byPriority ?? {}).filter(([, count]) => count > 0);
  const byType = Object.entries(state.data?.byType ?? {}).filter(([, count]) => count > 0);

  return (
    <PortalPanel title={title}>
      {state.status === 'updating' ? (
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
          Actualizando
        </p>
      ) : null}
      {openCount === 0 ? (
        <BlockEmpty
          title="Sin casos pendientes"
          description="No hay casos abiertos ahora. Entra a la mesa de ayuda para registrar uno nuevo si hace falta."
          action={
            <Link href="/dashboard/assurance" className={portalInlineTextLinkClassName}>
              Ver la mesa de ayuda
            </Link>
          }
        />
      ) : (
        <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
          <p>
            {openCount} casos abiertos · {state.data?.atRiskCount ?? 0} en riesgo
          </p>
          {byPriority.length > 0 ? (
            <div>
              <p className="portal-eyebrow-muted mb-2">Por prioridad</p>
              <ul className="space-y-1">
                {byPriority.map(([priority, count]) => (
                  <li key={priority}>
                    <Link
                      href={`/dashboard/assurance?priority=${encodeURIComponent(priority)}`}
                      className={portalInlineTextLinkClassName}
                    >
                      {getAssuranceTicketPriorityLabel(priority)} · {count}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {byType.length > 0 ? (
            <div>
              <p className="portal-eyebrow-muted mb-2">Por tipo</p>
              <ul className="space-y-1">
                {byType.map(([type, count]) => (
                  <li key={type}>
                    <Link
                      href={`/dashboard/assurance?type=${encodeURIComponent(type)}`}
                      className={portalInlineTextLinkClassName}
                    >
                      {getAssuranceTicketTypeLabel(type)} · {count}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {byPriority.length === 0 && byType.length === 0 ? (
            <Link href="/dashboard/assurance?status=OPEN" className={portalInlineTextLinkClassName}>
              Abrir mesa de ayuda
            </Link>
          ) : null}
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
    <PortalPanel title={title} {...headingProps}>
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
              <Link
                href={`/dashboard/commercial?tab=${encodeURIComponent(item.destinoTab)}&focus=${encodeURIComponent(item.id)}`}
                className="block min-h-11 rounded-xl border border-gray-100 px-4 py-3 transition-colors hover:border-iwana-primary dark:border-dark-border-2"
              >
                <p className="text-sm font-medium text-gray-900 dark:text-white">{item.name}</p>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  {commercialAttentionReasonLabel(item.reason)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PortalPanel>
  );
}

function PipelineBlock({
  sources,
  onRetry,
}: {
  sources: DashboardSourcesState;
  onRetry: () => void;
}) {
  const state = sources.crm;
  const title = resolveDashboardBlock('pipeline').title;
  if (state.status === 'loading' && !state.data) {
    return <BlockLoading title={title} rows={2} />;
  }
  if (state.status === 'error' && !state.data) {
    return (
      <BlockError
        title={title}
        message="No pudimos cargar el embudo de oportunidades. Reintenta en unos minutos."
        onRetry={onRetry}
      />
    );
  }
  const total = state.data?.total ?? 0;
  const open = openPipelineCount(state.data) ?? 0;
  const openStatuses = Object.entries(state.data?.data ?? {}).filter(
    ([status, count]) => count > 0 && !CLOSED_PIPELINE_STATUSES.has(status),
  );

  return (
    <PortalPanel title={title}>
      {state.status === 'updating' ? (
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
          Actualizando
        </p>
      ) : null}
      {total === 0 ? (
        <BlockEmpty
          title="Aún no hay oportunidades"
          description="Registra la primera oportunidad para empezar a seguir el embudo comercial."
          action={
            <Link href="/dashboard/crm/expedientes" className={portalInlineTextLinkClassName}>
              Registrar la primera oportunidad
            </Link>
          }
        />
      ) : open === 0 ? (
        <BlockEmpty
          title="Sin oportunidades abiertas"
          description="No hay oportunidades en seguimiento ahora. Puedes revisar el historial del embudo."
          action={
            <Link href="/dashboard/crm/expedientes" className={portalInlineTextLinkClassName}>
              Ver el historial
            </Link>
          }
        />
      ) : (
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <p>
            {open} en seguimiento · {total} en total
          </p>
          <ul className="space-y-1">
            {openStatuses.map(([status, count]) => (
              <li key={status} className="flex items-center justify-between gap-3">
                <span>{formatExpedienteStatus(status)}</span>
                <span className="font-mono tabular-nums text-gray-900 dark:text-white">
                  {count}
                </span>
              </li>
            ))}
          </ul>
          <Link
            href="/dashboard/crm/expedientes?view=open"
            className={portalInlineTextLinkClassName}
          >
            Ver oportunidades
          </Link>
        </div>
      )}
    </PortalPanel>
  );
}

function InventoryBlock({
  sources,
  onRetry,
}: {
  sources: DashboardSourcesState;
  onRetry: () => void;
}) {
  const state = sources.inventory;
  const title = resolveDashboardBlock('inventory').title;
  if (state.status === 'loading' && !state.data) {
    return <BlockLoading title={title} rows={2} />;
  }
  if (state.status === 'error' && !state.data) {
    return (
      <BlockError
        title={title}
        message="No pudimos cargar el estado del almacén. Reintenta en unos minutos."
        onRetry={onRetry}
      />
    );
  }
  const itemsCount = state.data?.itemsCount ?? 0;
  return (
    <PortalPanel title={title}>
      {state.status === 'updating' ? (
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
          Actualizando
        </p>
      ) : null}
      {itemsCount === 0 ? (
        <BlockEmpty
          title="Aún no hay productos en inventario"
          description="Registra el primer producto operativo para ver existencias y valor estimado aquí."
          action={
            <Link href="/dashboard/inventory" className={portalInlineTextLinkClassName}>
              Registrar el primer producto
            </Link>
          }
        />
      ) : (
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Existencias</dt>
            <dd className="mt-1 font-medium text-gray-900 dark:text-white">
              {state.data?.totalOnHand ?? 'Sin dato disponible'}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500 dark:text-gray-400">Valor estimado</dt>
            <dd className="mt-1 font-medium text-gray-900 dark:text-white">
              {state.data
                ? new Intl.NumberFormat('es-CO', {
                    style: 'currency',
                    currency: 'COP',
                    maximumFractionDigits: 0,
                  }).format(state.data.estimatedTotalValue)
                : 'Sin dato disponible'}
            </dd>
          </div>
        </dl>
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
    case 'help-desk':
      return (
        <HelpDeskBlock key={blockId} sources={sources} onRetry={() => onRetrySource('assurance')} />
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
    case 'pipeline':
      return <PipelineBlock key={blockId} sources={sources} onRetry={() => onRetrySource('crm')} />;
    case 'inventory':
      return (
        <InventoryBlock
          key={blockId}
          sources={sources}
          onRetry={() => onRetrySource('inventory')}
        />
      );
    case 'next-configuration': {
      const summary = sources['tenant-summary'];
      if (summary.status === 'loading' && !summary.data) {
        return <BlockLoading key={blockId} title={resolveDashboardBlock(blockId).title} rows={2} />;
      }
      if (summary.status === 'error' && !summary.data) {
        return (
          <BlockError
            key={blockId}
            title={resolveDashboardBlock(blockId).title}
            message="No pudimos cargar el próximo paso de configuración. Reintenta en unos minutos."
            onRetry={() => onRetrySource('tenant-summary')}
          />
        );
      }
      return (
        <section key={blockId} aria-label={resolveDashboardBlock(blockId).title}>
          <OnboardingAlerts
            alerts={summary.data?.alerts ?? []}
            isUpdating={summary.status === 'updating'}
            operationState={resolveOnboardingOperationState(sources)}
          />
        </section>
      );
    }
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
    case 'quick-actions':
      return (
        <section key={blockId} aria-label={resolveDashboardBlock(blockId).title}>
          <QuickActionsPanel role={role} />
        </section>
      );
    default: {
      const _exhaustive: never = blockId;
      return _exhaustive;
    }
  }
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
  const [foldedOpen, setFoldedOpen] = useState(false);
  const lastFetchedAtRef = useRef<string | null>(null);
  const commercialHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const groupHeadingRefs = useRef<Partial<Record<string, HTMLHeadingElement | null>>>({});
  const prevGroupErrorRef = useRef<Record<string, boolean>>({});

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
                'No pudimos cargar este bloque. Reintenta en unos minutos.',
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

  const refreshAll = useCallback(() => {
    if (!role) return;
    const slug = resolveTenantSlug().slug;
    if (!slug) return;
    const sourceIds = resolveDashboardDataSources(role);
    void loadSources({ sourceIds, silent: true, slug, role });
  }, [loadSources, role]);

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
    if (!composition) return;
    const groups = groupDashboardMetricsByDomain(composition.metricIds);
    for (const group of groups) {
      const hasError = group.metricIds.some(
        (metricId) => metricSourceStatus(metricId, sources) === 'error',
      );
      const hadError = prevGroupErrorRef.current[group.domainId] === true;
      if (hadError && !hasError) {
        groupHeadingRefs.current[group.domainId]?.focus();
      }
      prevGroupErrorRef.current[group.domainId] = hasError;
    }
  }, [composition, sources]);

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
  }, [foldedOpen, highlightCommercial]);

  if (!user || !role || !composition) {
    return (
      <div className="space-y-6">
        <PageHeader title="Inicio" subtitle="No pudimos determinar tu perfil de acceso." />
      </div>
    );
  }

  const primary = resolveDashboardAction(composition.primaryActionId);
  const secondary = composition.secondaryActionId
    ? resolveDashboardAction(composition.secondaryActionId)
    : null;

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

  const supportIds = composition.supportBlockIds;
  const metricGroups = groupDashboardMetricsByDomain(composition.metricIds);
  const metricValues: Partial<Record<DashboardMetricId, number | null>> = {};
  const metricStatuses: Partial<Record<DashboardMetricId, DashboardMetricSourceStatus>> = {};
  for (const metricId of composition.metricIds) {
    metricValues[metricId] = metricValue(metricId, sources);
    metricStatuses[metricId] = metricSourceStatus(metricId, sources);
  }
  const { promotedBlockIds, remainingFoldedBlockIds } = resolvePromotedFoldedBlockIds({
    foldedBlockIds: composition.foldedBlockIds,
    metricValues,
    metricStatuses,
  });
  const foldedCount = remainingFoldedBlockIds.length;

  return (
    <div className="space-y-6">
      {/* B0 · Encabezado */}
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
                Algunos datos no se actualizaron. Revisa los avisos o pulsa Actualizar.
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
        actions={
          <DashboardHeaderActions primary={primary} secondary={secondary} onRefresh={refreshAll} />
        }
      />

      {/* B1 · Indicadores núcleo — agrupados por dominio (Adenda §A) */}
      {composition.metricIds.length > 0 ? (
        <section aria-label="Indicadores núcleo">
          {firstLoadPending ? (
            <MetricsSkeleton groups={metricGroups} />
          ) : (
            <div className="space-y-6">
              {metricGroups.map((group) => {
                const groupHasError = group.metricIds.some(
                  (metricId) => metricSourceStatus(metricId, sources) === 'error',
                );
                return (
                  <div key={group.domainId} className="space-y-3">
                    <h2
                      ref={(node) => {
                        groupHeadingRefs.current[group.domainId] = node;
                      }}
                      tabIndex={-1}
                      className={cn('portal-eyebrow', interactiveFocusClassName)}
                    >
                      {group.label}
                    </h2>
                    {groupHasError ? (
                      <PortalAlert
                        variant="error"
                        live="polite"
                        title={`No pudimos actualizar las cifras de ${group.label.toLocaleLowerCase('es-CO')}`}
                        description="Las cifras anteriores siguen visibles. Reintenta en cada tarjeta con aviso."
                      />
                    ) : null}
                    <div
                      className={`grid grid-cols-1 gap-4 ${group.metricIds.length > 1 ? 'sm:grid-cols-2' : ''}`}
                    >
                      {group.metricIds.map((metricId) => {
                        const def = resolveDashboardMetric(metricId);
                        const status = metricSourceStatus(metricId, sources);
                        const value = metricValue(metricId, sources);
                        const delta = metricDelta(metricId, sources);
                        const href = def.buildHref(today);
                        const metricState =
                          status === 'loading' ? 'loading' : status === 'error' ? 'error' : 'idle';

                        const description =
                          status === 'updating' ? (
                            <span aria-live="polite">Actualizando · {def.description}</span>
                          ) : (
                            def.description
                          );

                        const common = {
                          label: def.label,
                          value,
                          description,
                          accent: def.accent,
                          state: metricState as 'idle' | 'loading' | 'error',
                          icon: def.icon,
                          ...(delta ? { delta } : {}),
                          ...(metricState === 'error'
                            ? {
                                onRetry: () => {
                                  for (const sourceId of def.sources) {
                                    retrySource(sourceId);
                                  }
                                },
                              }
                            : {}),
                        };

                        if (href) {
                          return <PortalDashboardMetric key={metricId} {...common} href={href} />;
                        }

                        return (
                          <PortalDashboardMetric
                            key={metricId}
                            {...common}
                            onClick={() => {
                              setHighlightCommercial(true);
                              setFoldedOpen(true);
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {/* B2 / B2b */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {composition.dominantBlockId ? (
          <div className="xl:col-span-8 flex flex-col gap-6">
            {renderDashboardBlock({
              blockId: composition.dominantBlockId,
              sources,
              composition,
              highlightCommercial,
              onRetrySource: retrySource,
              role,
              commercialHeadingRef,
            })}
            {promotedBlockIds.map((blockId) =>
              renderDashboardBlock({
                blockId,
                sources,
                composition,
                highlightCommercial,
                onRetrySource: retrySource,
                role,
                commercialHeadingRef,
              }),
            )}
            {foldedCount > 0 ? (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setFoldedOpen((open) => !open)}
                  className={`${portalInlineTextLinkClassName} ${interactiveFocusClassName}`}
                  aria-expanded={foldedOpen}
                >
                  {foldedOpen
                    ? 'Ocultar bloques adicionales'
                    : `Ver más · ${foldedCount} ${foldedCount === 1 ? 'bloque' : 'bloques'}`}
                </button>
                {foldedOpen
                  ? remainingFoldedBlockIds.map((blockId) =>
                      renderDashboardBlock({
                        blockId,
                        sources,
                        composition,
                        highlightCommercial,
                        onRetrySource: retrySource,
                        role,
                        commercialHeadingRef,
                      }),
                    )
                  : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div
          className={`flex flex-col gap-6 ${composition.dominantBlockId ? 'xl:col-span-4' : 'xl:col-span-12'}`}
        >
          {supportIds.map((blockId) =>
            renderDashboardBlock({
              blockId,
              sources,
              composition,
              highlightCommercial,
              onRetrySource: retrySource,
              role,
              commercialHeadingRef,
            }),
          )}
        </div>
      </div>

      {/* B3 · Estado de la empresa */}
      {composition.showOperationalTenantCard ? (
        <section aria-label="Estado de la empresa">
          {operationalTenant && operationalSettings ? (
            <TenantSummaryCard tenant={operationalTenant} settings={operationalSettings} />
          ) : (
            <IdentityOnlyCard branding={branding} />
          )}
        </section>
      ) : null}
    </div>
  );
}

/** Expone limpieza de caché de sesión para pruebas. */
export function __resetDashboardSessionCacheForTests(): void {
  dashboardSessionCache = null;
}
