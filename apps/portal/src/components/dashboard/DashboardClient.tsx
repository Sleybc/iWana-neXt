// apps/portal/src/components/dashboard/DashboardClient.tsx
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { ExpedienteStatus, UserRole } from '@iwana/shared';
import { MoreHorizontal, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  PortalAlert,
  PortalDashboardMetric,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
  portalInlineTextLinkClassName,
} from '@/components/shared/portal-ui';
import { useAuth } from '@/components/auth/AuthProvider';
import { resolveTenantSlug } from '@/lib/tenant-resolution';
import {
  ApiError,
  assuranceApi,
  auditApi,
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
  type WfmDashboardSummary,
} from '@/lib/api-client';
import { TenantSummaryCard } from './TenantSummaryCard';
import { OnboardingAlerts } from './OnboardingAlerts';
import { RecentActivityPanel } from './RecentActivityPanel';
import { QuickActionsPanel } from './QuickActionsPanel';
import {
  getDashboardRoleComposition,
  isUserRole,
  resolveDashboardAction,
  resolveDashboardBlock,
  resolveDashboardDataSources,
  resolveDashboardMetric,
  toLocalDayKey,
  type DashboardActionDefinition,
  type DashboardBlockId,
  type DashboardDataSourceId,
  type DashboardMetricId,
  type DashboardRoleComposition,
} from './dashboard-role-composition';

type LoadStatus = 'idle' | 'loading' | 'updating' | 'success' | 'error';

interface SourceState<T> {
  status: LoadStatus;
  data: T | null;
  error: string | null;
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
  return { status: 'idle', data: null, error: null };
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
  value: { status: LoadStatus; data: unknown; error: string | null },
): void {
  // Indexación heterogénea del fan-out: el discriminante es `id`.
  (state as Record<DashboardDataSourceId, SourceState<unknown>>)[id] = value;
}

function mapSourceError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente.';
    if (error.status === 403) return 'No tienes permisos para este bloque.';
    return error.message || fallback;
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

interface DashboardCacheEntry {
  role: UserRole;
  slug: string;
  sources: DashboardSourcesState;
  lastFetchedAt: string;
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
      return auditApi.list({ limit: 8 }, slug);
    default: {
      const _exhaustive: never = sourceId;
      return _exhaustive;
    }
  }
}

function MetricsSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
      {Array.from({ length: Math.max(count, 1) }).map((_, i) => (
        <PortalSkeletonBlock key={i} className="h-[148px] rounded-3xl" />
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
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium';

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
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex w-full flex-wrap items-center gap-2 md:justify-end">
      <button
        type="button"
        onClick={onRefresh}
        className={`${headerActionClassName} hidden border border-gray-200 text-gray-700 hover:bg-gray-50 md:inline-flex dark:border-dark-border dark:text-gray-200 dark:hover:bg-dark-surface-3`}
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Actualizar
      </button>
      {secondary ? (
        <Link
          href={secondary.href}
          className={`${headerActionClassName} hidden border border-iwana-primary text-iwana-primary hover:bg-iwana-primary-50 md:inline-flex dark:border-iwana-primary-300 dark:text-iwana-primary-300 dark:hover:bg-iwana-primary/10`}
        >
          {secondary.label}
        </Link>
      ) : null}
      <Link
        href={primary.href}
        className={`${headerActionClassName} bg-iwana-primary text-white hover:bg-iwana-primary-600`}
      >
        {primary.label}
      </Link>
      <div className="relative md:hidden">
        <button
          type="button"
          className={`${headerActionClassName} border border-gray-200 text-gray-700 dark:border-dark-border dark:text-gray-200`}
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-haspopup="menu"
          aria-label="Más acciones del inicio"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
        {menuOpen ? (
          <div
            id={menuId}
            role="menu"
            className="absolute right-0 z-20 mt-2 min-w-[220px] rounded-2xl border border-gray-200 bg-white p-2 shadow-iwana-lg dark:border-dark-border dark:bg-dark-surface-2"
          >
            <div role="none" className="flex flex-col gap-1">
              <button
                type="button"
                role="menuitem"
                className={`${headerActionClassName} w-full justify-start border border-gray-200 text-gray-700 dark:border-dark-border dark:text-gray-200`}
                onClick={() => {
                  setMenuOpen(false);
                  onRefresh();
                }}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Actualizar
              </button>
              {secondary ? (
                <Link
                  role="menuitem"
                  href={secondary.href}
                  className={`${headerActionClassName} w-full justify-start border border-iwana-primary text-iwana-primary dark:border-iwana-primary-300 dark:text-iwana-primary-300`}
                  onClick={() => setMenuOpen(false)}
                >
                  {secondary.label}
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
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

function FieldAttentionBlock({
  sources,
  onRetry,
}: {
  sources: DashboardSourcesState;
  onRetry: () => void;
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
  const alerts = state.data?.alerts ?? [];
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
        <ul className="space-y-3">
          {alerts.slice(0, 5).map((alert) => (
            <li
              key={alert.id}
              className="rounded-xl border border-gray-100 px-4 py-3 dark:border-dark-border-2"
            >
              <p className="text-sm font-medium text-gray-900 dark:text-white">{alert.title}</p>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{alert.description}</p>
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
        <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
          <p>
            {openCount} casos abiertos · {state.data?.atRiskCount ?? 0} en riesgo
          </p>
          <Link href="/dashboard/assurance?status=OPEN" className={portalInlineTextLinkClassName}>
            Revisar casos abiertos
          </Link>
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
}: {
  sources: DashboardSourcesState;
  onRetry: () => void;
  highlight?: boolean;
  accountantOnly?: boolean;
}) {
  const state = sources.commercial;
  const title = resolveDashboardBlock('commercial-attention').title;
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
    <PortalPanel title={title}>
      {highlight ? (
        <p className="mb-3 text-xs font-medium text-iwana-secondary-700 dark:text-iwana-secondary-300">
          Ofertas en riesgo — detalle en esta lista
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
      ) : (
        <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
          <p>
            {open} en seguimiento · {total} en total
          </p>
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
}: {
  blockId: DashboardBlockId;
  sources: DashboardSourcesState;
  composition: DashboardRoleComposition;
  highlightCommercial: boolean;
  onRetrySource: (sourceId: DashboardDataSourceId) => void;
  role: UserRole;
}) {
  switch (blockId) {
    case 'field-attention':
      return (
        <FieldAttentionBlock key={blockId} sources={sources} onRetry={() => onRetrySource('wfm')} />
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
          <OnboardingAlerts alerts={summary.data?.alerts ?? []} />
        </section>
      );
    }
    case 'change-history':
      return (
        <section key={blockId} aria-label={resolveDashboardBlock(blockId).title}>
          <RecentActivityPanel />
        </section>
      );
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
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [highlightCommercial, setHighlightCommercial] = useState(false);
  const [foldedOpen, setFoldedOpen] = useState(false);

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
            });
          }
        }
        // R-5 · snapshot de sesión para volver con «Atrás» sin refetch.
        dashboardSessionCache = {
          role: loadRole,
          slug,
          sources: next,
          lastFetchedAt: fetchedAt,
        };
        return next;
      });

      setLastFetchedAt(fetchedAt);
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
      setLastFetchedAt(cached.lastFetchedAt);
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
  const foldedIds = composition.foldedBlockIds;

  return (
    <div className="space-y-6">
      {/* B0 · Encabezado */}
      <PageHeader
        title={companyTitle}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Última lectura: {formatLastReadAt(lastFetchedAt)}</span>
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

      {/* B1 · Indicadores núcleo */}
      {composition.metricIds.length > 0 ? (
        <section aria-label="Indicadores núcleo">
          {firstLoadPending ? (
            <MetricsSkeleton count={composition.metricIds.length} />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {composition.metricIds.map((metricId) => {
                const def = resolveDashboardMetric(metricId);
                const status = metricSourceStatus(metricId, sources);
                const value = metricValue(metricId, sources);
                const delta = metricDelta(metricId, sources);
                const href = def.buildHref(today);
                const metricState =
                  status === 'loading'
                    ? 'loading'
                    : status === 'error' && value == null
                      ? 'error'
                      : 'idle';

                const description =
                  status === 'updating' ? (
                    <span aria-live="polite">Actualizando · {def.description}</span>
                  ) : (
                    def.description
                  );

                const common = {
                  eyebrow: def.eyebrow,
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
            })}
            {foldedIds.length > 0 ? (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setFoldedOpen((open) => !open)}
                  className={portalInlineTextLinkClassName}
                  aria-expanded={foldedOpen}
                >
                  {foldedOpen ? 'Ocultar bloques adicionales' : 'Ver más'}
                </button>
                {foldedOpen
                  ? foldedIds.map((blockId) =>
                      renderDashboardBlock({
                        blockId,
                        sources,
                        composition,
                        highlightCommercial,
                        onRetrySource: retrySource,
                        role,
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
