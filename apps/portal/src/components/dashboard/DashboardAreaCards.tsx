// apps/portal/src/components/dashboard/DashboardAreaCards.tsx
'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { TicketPriority, type SubscriberQueueCounts } from '@iwana/shared';
import { Badge, StackedBar, type FillEmphasis, type Tone } from '@iwana/ui';
import {
  PortalAlert,
  PortalPanel,
  PortalSkeletonBlock,
  portalInlineTextLinkClassName,
} from '@/components/shared/portal-ui';
import type {
  AssuranceDashboardSummary,
  BillingDashboardSummary,
  InventoryDashboardSummary,
  WfmDashboardSummary,
} from '@/lib/api-client';
import { getAssuranceTicketPriorityLabel } from '@/components/assurance/assurance-labels';
import { formatExpedienteStatus } from '@/components/crm/expedientes/expediente-ui';
import type {
  DashboardAreaId,
  DashboardDataSourceId,
  DashboardModuleHealthStatus,
} from './dashboard-role-composition';
import {
  DashboardBars,
  DashboardStackLegend,
  formatDashboardMoneyCompact,
  formatDashboardNumber,
  type DashboardSegment,
} from './dashboard-visuals';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);

const healthBadge = {
  ok: { label: 'Al día', variant: 'lime' },
  attention: { label: 'Atención', variant: 'warning' },
  'at-risk': { label: 'En riesgo', variant: 'error' },
  unknown: { label: 'Sin dato', variant: 'neutral' },
} as const;

/** Urgencia por tono e intensidad (contrato DS v1.1 §5.5); el lima no es una prioridad (Firma §3). */
const PRIORITY_SEGMENTS: readonly {
  priority: TicketPriority;
  tone: Tone;
  emphasis?: FillEmphasis;
}[] = [
  { priority: TicketPriority.CRITICAL, tone: 'error', emphasis: 'strong' },
  { priority: TicketPriority.URGENT, tone: 'error', emphasis: 'soft' },
  { priority: TicketPriority.HIGH, tone: 'warning' },
  { priority: TicketPriority.NORMAL, tone: 'primary', emphasis: 'soft' },
  { priority: TicketPriority.LOW, tone: 'neutral' },
];

/** Casos abiertos por prioridad, en el orden de urgencia. */
export function casePrioritySegments(byPriority: Record<string, number>): DashboardSegment[] {
  return PRIORITY_SEGMENTS.map(({ priority, tone, emphasis }) => ({
    key: priority,
    label: getAssuranceTicketPriorityLabel(priority),
    value: byPriority[priority] ?? 0,
    tone,
    ...(emphasis ? { emphasis } : {}),
  }));
}

/**
 * Cartera vencida por antigüedad (N1 `overdue.buckets`, siempre los cuatro tramos en orden).
 * La mora nunca va en lima: los tramos recientes en neutro y primario suave, los viejos en
 * advertencia y error (CA-PA-03; contrato DS v1.1 §5.5).
 */
const OVERDUE_BUCKET_SEGMENTS: Record<
  BillingDashboardSummary['overdue']['buckets'][number]['bucket'],
  { label: string; tone: Tone; emphasis?: FillEmphasis }
> = {
  '1_30': { label: '1 a 30 días', tone: 'neutral' },
  '31_60': { label: '31 a 60 días', tone: 'primary', emphasis: 'soft' },
  '61_90': { label: '61 a 90 días', tone: 'warning' },
  '90_plus': { label: 'Más de 90 días', tone: 'error', emphasis: 'strong' },
};

export function overdueBucketSegments(
  buckets: BillingDashboardSummary['overdue']['buckets'],
): DashboardSegment[] {
  return buckets.map((bucket) => ({
    key: bucket.bucket,
    label: OVERDUE_BUCKET_SEGMENTS[bucket.bucket].label,
    // Texto decimal → número solo para pintar la proporción.
    value: Number(bucket.amount),
    tone: OVERDUE_BUCKET_SEGMENTS[bucket.bucket].tone,
    ...(OVERDUE_BUCKET_SEGMENTS[bucket.bucket].emphasis
      ? { emphasis: OVERDUE_BUCKET_SEGMENTS[bucket.bucket].emphasis }
      : {}),
  }));
}

/** Base de suscriptores: activos frente a suspendidos. */
export function subscriberBaseSegments(counts: SubscriberQueueCounts): DashboardSegment[] {
  return [
    {
      key: 'active',
      label: 'Activos',
      value: counts.active,
      tone: 'primary',
      emphasis: 'strong',
    },
    { key: 'suspended', label: 'Suspendidos', value: counts.suspended, tone: 'warning' },
  ];
}

function AreaLead({ figure, caption }: { figure: string; caption: string }) {
  return (
    <p className="text-sm text-gray-600 dark:text-gray-400">
      <span className="mr-1.5 text-3xl leading-none font-bold tabular-nums text-iwana-primary dark:text-white">
        {figure}
      </span>
      {caption}
    </p>
  );
}

export interface DashboardAreaSource<T> {
  status: 'idle' | 'loading' | 'updating' | 'success' | 'error';
  data: T | null;
  /** Mensaje de negocio de la fuente (sesión vencida, sin acceso). */
  error?: string | null;
}

export interface DashboardAreaHealth {
  label: string;
  status: DashboardModuleHealthStatus;
  href: string;
}

export interface DashboardProvisioningCounts {
  inExecution: number;
  failed: number;
  closedUnprovisioned: number;
}

export interface DashboardAreaCardsProps {
  showNetworkAvailability?: boolean;
  areaIds: readonly DashboardAreaId[];
  health: Record<DashboardAreaId, DashboardAreaHealth>;
  assurance: DashboardAreaSource<AssuranceDashboardSummary>;
  wfm: DashboardAreaSource<WfmDashboardSummary>;
  /** Conteo por etapa solo de oportunidades en seguimiento. */
  pipeline: DashboardAreaSource<{ openByStatus: Record<string, number>; open: number }>;
  billing: DashboardAreaSource<BillingDashboardSummary>;
  subscribers: DashboardAreaSource<SubscriberQueueCounts>;
  provisioning: DashboardAreaSource<DashboardProvisioningCounts>;
  inventory: DashboardAreaSource<InventoryDashboardSummary>;
  onRetrySource: (sourceId: DashboardDataSourceId) => void;
}

interface AreaContent {
  source: DashboardAreaSource<unknown>;
  sourceId: DashboardDataSourceId;
  body: ReactNode;
  footer: string | null;
}

function resolveAreaContent(id: DashboardAreaId, props: DashboardAreaCardsProps): AreaContent {
  switch (id) {
    case 'help-desk': {
      const data = props.assurance.data;
      const open = data?.openCount ?? 0;
      const segments = casePrioritySegments(data?.byPriority ?? {});
      return {
        source: props.assurance,
        sourceId: 'assurance',
        body: (
          <>
            <AreaLead
              figure={formatDashboardNumber(open)}
              caption={open > 0 ? 'casos abiertos por prioridad' : 'casos abiertos'}
            />
            <StackedBar segments={segments} ariaLabel="Casos abiertos por prioridad" size="md" />
            <DashboardStackLegend segments={segments} />
          </>
        ),
        footer: data
          ? `${formatDashboardNumber(data.resolvedTodayCount)} resueltos hoy · ${formatDashboardNumber(data.fieldServicePendingCount)} esperan visita`
          : null,
      };
    }
    case 'scheduling': {
      const data = props.wfm.data;
      const load = data?.technicianLoad ?? [];
      const busy = load.filter((entry) => entry.riskLevel === 'HIGH').length;
      const overdue = data?.overdueCount ?? 0;
      return {
        source: props.wfm,
        sourceId: 'wfm',
        body: (
          <>
            <AreaLead figure={formatDashboardNumber(data?.todayCount ?? 0)} caption="visitas hoy" />
            <DashboardBars
              rows={[
                { key: 'en-route', label: 'En ruta', value: data?.enRouteCount ?? 0 },
                {
                  key: 'overdue',
                  label: 'Vencidas',
                  value: overdue,
                  tone: overdue > 0 ? 'danger' : 'default',
                },
                { key: 'upcoming', label: 'Próximos 7 días', value: data?.upcomingCount ?? 0 },
              ]}
            />
          </>
        ),
        footer:
          load.length > 0
            ? `${formatDashboardNumber(load.length)} técnicos con agenda hoy · ${formatDashboardNumber(busy)} con ocupación alta`
            : 'Sin técnicos con agenda hoy',
      };
    }
    case 'opportunities': {
      const data = props.pipeline.data;
      const rows = Object.entries(data?.openByStatus ?? {})
        .filter(([, count]) => count > 0)
        .map(([status, count]) => ({
          key: status,
          label: formatExpedienteStatus(status),
          value: count,
        }));
      return {
        source: props.pipeline,
        sourceId: 'crm',
        body: (
          <>
            <AreaLead
              figure={formatDashboardNumber(data?.open ?? 0)}
              caption={rows.length > 0 ? 'en seguimiento por etapa' : 'en seguimiento'}
            />
            {rows.length > 0 ? <DashboardBars rows={rows} /> : null}
          </>
        ),
        footer: null,
      };
    }
    case 'billing': {
      const overdue = props.billing.data?.overdue;
      const amount = Number(overdue?.amount ?? 0);
      const segments = overdue ? overdueBucketSegments(overdue.buckets) : [];
      return {
        source: props.billing,
        sourceId: 'billing-summary',
        body: (
          <>
            <AreaLead
              figure={formatDashboardMoneyCompact(amount)}
              caption={amount > 0 ? 'vencidos por antigüedad' : 'sin cartera vencida'}
            />
            <StackedBar
              segments={segments}
              ariaLabel="Cartera vencida por antigüedad"
              size="md"
              formatValue={formatDashboardMoneyCompact}
            />
            <DashboardStackLegend segments={segments} formatValue={formatDashboardMoneyCompact} />
          </>
        ),
        footer: overdue
          ? `${formatDashboardNumber(overdue.subscriberCount)} ${overdue.subscriberCount === 1 ? 'suscriptor' : 'suscriptores'} en mora · ${formatDashboardNumber(overdue.documentCount)} ${overdue.documentCount === 1 ? 'factura vencida' : 'facturas vencidas'}`
          : null,
      };
    }
    case 'subscribers': {
      const data = props.subscribers.data;
      const segments = data ? subscriberBaseSegments(data) : [];
      return {
        source: props.subscribers,
        sourceId: 'subscribers',
        body: (
          <>
            <AreaLead figure={formatDashboardNumber(data?.active ?? 0)} caption="activos" />
            <StackedBar segments={segments} ariaLabel="Base de suscriptores" size="md" />
            <DashboardStackLegend segments={segments} />
          </>
        ),
        footer: data
          ? `${formatDashboardNumber(data.contactPending)} con contacto pendiente · ${formatDashboardNumber(data.withoutLiveServices)} sin servicios vigentes`
          : null,
      };
    }
    case 'provisioning': {
      const data = props.provisioning.data;
      return {
        source: props.provisioning,
        sourceId: 'provisioning',
        body: (
          <>
            <AreaLead
              figure={formatDashboardNumber(data?.inExecution ?? 0)}
              caption="instalaciones en ejecución"
            />
            <DashboardBars
              rows={[
                { key: 'in-execution', label: 'En ejecución', value: data?.inExecution ?? 0 },
                {
                  key: 'failed',
                  label: 'Sin aprovisionar',
                  value: data?.failed ?? 0,
                  tone: (data?.failed ?? 0) > 0 ? 'danger' : 'default',
                },
                {
                  key: 'closed',
                  label: 'Cerradas sin aprovisionar',
                  value: data?.closedUnprovisioned ?? 0,
                  tone: (data?.closedUnprovisioned ?? 0) > 0 ? 'warning' : 'default',
                },
              ]}
            />
          </>
        ),
        footer: null,
      };
    }
    case 'inventory': {
      const data = props.inventory.data;
      const rows = [...(data?.balancesByCategory ?? [])]
        .filter((category) => category.totalOnHand > 0)
        .sort((left, right) => right.totalOnHand - left.totalOnHand)
        .slice(0, 3)
        .map((category) => ({
          key: category.categoryId,
          label: category.categoryName,
          value: category.totalOnHand,
        }));
      return {
        source: props.inventory,
        sourceId: 'inventory',
        body: (
          <>
            <AreaLead
              figure={formatCurrency(data?.estimatedTotalValue ?? 0)}
              caption="valor estimado"
            />
            {rows.length > 0 ? <DashboardBars rows={rows} /> : null}
          </>
        ),
        footer: data
          ? `${formatDashboardNumber(data.itemsCount)} productos · ${formatDashboardNumber(data.locationsCount)} ubicaciones`
          : null,
      };
    }
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

/** Encabezado de card sin divisor: el estado del área es el titular (dirección §5.3). */
const areaHeaderClassName = 'mb-0 border-b-0 pb-0';
/** La card llena la celda de la rejilla y su pie queda anclado abajo. */
const areaPanelClassName = 'flex h-full flex-col';
const areaContentClassName = 'flex flex-1 flex-col';

/**
 * B3 · «Por área»: una card por módulo con su estado y una sola visual.
 * No son indicadores: el titular es el estado del área.
 */
export function DashboardAreaCards(props: DashboardAreaCardsProps) {
  if (props.areaIds.length === 0) return null;

  return (
    <section aria-label="Por área" className="space-y-2">
      <p className="portal-eyebrow">Por área</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {props.areaIds.map((id) => {
          const health = props.health[id];
          const content = resolveAreaContent(id, props);
          const { status, data } = content.source;

          if ((status === 'idle' || status === 'loading') && !data) {
            return (
              <PortalPanel
                key={id}
                compact
                title={health.label}
                busy
                headerClassName={areaHeaderClassName}
                className={areaPanelClassName}
                contentClassName={areaContentClassName}
              >
                <div className="space-y-3">
                  <PortalSkeletonBlock className="h-8 w-40 rounded-lg" />
                  <PortalSkeletonBlock className="h-14 rounded-xl" />
                </div>
              </PortalPanel>
            );
          }

          if (status === 'error' && !data) {
            return (
              <PortalPanel
                key={id}
                compact
                title={health.label}
                headerClassName={areaHeaderClassName}
                className={areaPanelClassName}
                contentClassName={areaContentClassName}
              >
                <PortalAlert
                  variant="error"
                  title={
                    content.source.error ??
                    'No pudimos cargar esta área. Reintenta en unos minutos.'
                  }
                  live="polite"
                  action={
                    <button
                      type="button"
                      onClick={() => props.onRetrySource(content.sourceId)}
                      className={portalInlineTextLinkClassName}
                    >
                      Reintentar
                    </button>
                  }
                />
              </PortalPanel>
            );
          }

          const badge = healthBadge[status === 'error' ? 'unknown' : health.status];
          return (
            <PortalPanel
              key={id}
              compact
              title={health.label}
              headerClassName={areaHeaderClassName}
              className={areaPanelClassName}
              contentClassName={areaContentClassName}
              actions={<Badge variant={badge.variant}>{badge.label}</Badge>}
            >
              <div className="flex h-full flex-col gap-3">
                {content.body}
                <div className="mt-auto flex items-center justify-between gap-3">
                  <p className="text-xs text-gray-600 dark:text-gray-400">{content.footer}</p>
                  <Link
                    href={health.href}
                    aria-label={`Abrir ${health.label}`}
                    className={portalInlineTextLinkClassName}
                  >
                    Abrir
                  </Link>
                </div>
              </div>
            </PortalPanel>
          );
        })}
        {props.showNetworkAvailability ? (
          <PortalPanel
            compact
            title="Red"
            headerClassName={areaHeaderClassName}
            className={areaPanelClassName}
            contentClassName={areaContentClassName}
            actions={<Badge variant="neutral">Sin medición</Badge>}
          >
            <p className="text-sm text-gray-600 dark:text-gray-400">
              La disponibilidad de los routers aún no se mide.
            </p>
            <Link
              href="/dashboard/network/routers"
              className={`${portalInlineTextLinkClassName} mt-auto min-h-11`}
            >
              Ver routers
            </Link>
          </PortalPanel>
        ) : null}
      </div>
    </section>
  );
}
