'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  TENANT_ATTENTION_STATUSES,
  TenantStatus,
  formatRelativeTime,
  type TenantStatusSummary,
} from '@iwana/shared';
import {
  AttentionQueue,
  Button,
  ProgressMeter,
  PulseStrip,
  StackedBar,
  type AttentionQueueProps,
  type AttentionRow,
  type PulseCellData,
} from '@iwana/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { RecentActivityPanel } from '@/components/dashboard/RecentActivityPanel';
import { LatestTenantsPanel } from '@/components/dashboard/LatestTenantsPanel';
import {
  SYSTEM_STATUS_LABELS,
  SystemStatusPanel,
  type StatusIndicator,
} from '@/components/dashboard/SystemStatusPanel';
import { PlatformUsersArea } from '@/components/dashboard/PlatformUsersArea';
import { TenantTrendPanel } from '@/components/dashboard/TenantTrendPanel';
import { AvailabilityTracker } from '@/components/dashboard/AvailabilityTracker';
import { WorkQueuesArea } from '@/components/dashboard/WorkQueuesArea';
import { TenantUsageArea, canSeeTenantUsage } from '@/components/dashboard/TenantUsageArea';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  TenantStatusDistribution,
  type StatusSegment,
} from '@/components/dashboard/TenantStatusDistribution';
import {
  healthApi,
  platformAuditApi,
  platformHealthApi,
  platformUsersApi,
  tenantApi,
  type HealthStatusResponse,
  type TenantListItem,
} from '@/lib/api-client';
import { describePlatformActivityLine } from '@/lib/platform-audit-vocabulary';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';
import { formatPercent, summarizeAvailability, summarizeWorkQueues } from '@/lib/platform-health';

const COPY = PLATFORM_UI_COPY.dashboard;
const HEALTH_ANCHOR = 'salud-de-plataforma';
const QUEUES_ANCHOR = 'colas-de-trabajo';
const ACTIVITY_VISIBLE = 5;

interface Remote<T> {
  data: T | null;
  error: boolean;
  loading: boolean;
  reload: () => void;
}

/** Una fuente remota con estado propio: su fallo degrada solo sus bloques (CA-PP-04). */
function useRemote<T>(fetcher: (() => Promise<T>) | null): Remote<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(fetcher !== null);

  const reload = useCallback(() => {
    // Sin fetcher (rol sin permiso) no se pide nada (CA-PP4-01).
    if (!fetcher) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetcher().then(
      (value) => {
        setData(value);
        setError(false);
        setLoading(false);
      },
      () => {
        setData(null);
        setError(true);
        setLoading(false);
      },
    );
  }, [fetcher]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, error, loading, reload };
}

const fetchSummary = () => tenantApi.summary();
const fetchLatest = () => tenantApi.list({ limit: 5 });
// Las acciones de sesión se excluyen en servidor (CA-PP2-04).
const fetchActivity = () =>
  platformAuditApi.list({
    excludeSessionEvents: true,
    excludeAccessEvents: true,
    limit: ACTIVITY_VISIBLE,
  });
const fetchTeam = () => platformUsersApi.summary();
const fetchHealth = () => healthApi.get();
const fetchHistory = () => platformHealthApi.history();
const fetchUsage = () => tenantApi.usage();

/** Cada indicador refleja solo su servicio (L-10, contrato DS v1.2 §4.1). */
function buildHealthIndicators(health: HealthStatusResponse | null): StatusIndicator[] {
  if (!health) {
    return [COPY.healthApiLabel, COPY.healthDbLabel, COPY.healthRedisLabel].map((label) => ({
      label,
      status: 'unknown',
      detail: COPY.healthNoReading,
    }));
  }
  const service = (label: string, value: 'ok' | 'error', okDetail: string): StatusIndicator =>
    value === 'ok'
      ? { label, status: 'ok', detail: okDetail }
      : { label, status: 'error', detail: COPY.healthUnavailable };
  return [
    {
      label: COPY.healthApiLabel,
      status: health.status === 'ok' ? 'ok' : 'warning',
      detail: health.status === 'ok' ? COPY.healthApiOk : COPY.healthApiDegraded,
    },
    service(COPY.healthDbLabel, health.db, COPY.healthDbOk),
    service(COPY.healthRedisLabel, health.redis, COPY.healthRedisOk),
  ];
}

function countsOf(summary: TenantStatusSummary | null) {
  const count = (status: TenantStatus) => summary?.byStatus[status] ?? 0;
  return {
    active: count(TenantStatus.ACTIVE),
    provisioning: count(TenantStatus.PROVISIONING),
    failed: count(TenantStatus.PROVISIONING_FAILED),
    suspended: count(TenantStatus.SUSPENDED),
    inactive: count(TenantStatus.INACTIVE),
    markedForDeletion: count(TenantStatus.MARKED_FOR_DELETION),
    attention: TENANT_ATTENTION_STATUSES.reduce((sum, key) => sum + count(TenantStatus[key]), 0),
  };
}

const QUEUE_LABELS: AttentionQueueProps['labels'] = {
  severity: { 'at-risk': COPY.queueAtRisk, attention: COPY.queueAttention },
  partial: COPY.queuePartial,
  retry: COPY.retry,
  allClear: COPY.queueAllClear,
  allClearHint: COPY.queueAllClearHint,
  showMore: COPY.queueShowMore,
  showLess: COPY.queueShowLess,
};

const PULSE_LABELS = {
  unavailable: COPY.pulseUnavailable,
  noData: COPY.pulseNoData,
  retry: COPY.retry,
  updating: COPY.pulseUpdating,
};

const TENANT_ATTENTION_TITLE: Record<string, string> = {
  [TenantStatus.PROVISIONING_FAILED]: COPY.queueTenantFailed,
  [TenantStatus.SUSPENDED]: COPY.queueTenantSuspended,
  [TenantStatus.MARKED_FOR_DELETION]: COPY.queueTenantDeletion,
};

export function DashboardClient() {
  const companiesHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusCompanies = useCallback(() => {
    const heading = companiesHeadingRef.current;
    if (!heading) return;
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    heading.focus({ preventScroll: reduceMotion });
    if (!reduceMotion && typeof heading.scrollIntoView === 'function') {
      heading.scrollIntoView({ block: 'nearest' });
    }
  }, []);
  const summary = useRemote(fetchSummary);
  const latest = useRemote<TenantListItem[]>(fetchLatest);
  const activity = useRemote(fetchActivity);
  const health = useRemote(fetchHealth);
  const team = useRemote(fetchTeam);
  const history = useRemote(fetchHistory);
  const { user } = useAuth();
  const showUsage = canSeeTenantUsage(user?.role);
  const usage = useRemote(showUsage ? fetchUsage : null);

  const { reload: reloadSummary } = summary;
  const { reload: reloadLatest } = latest;
  const { reload: reloadActivity } = activity;
  const { reload: reloadHealth } = health;
  const { reload: reloadTeam } = team;
  const { reload: reloadHistory } = history;
  const { reload: reloadUsage } = usage;
  const refreshAll = useCallback(() => {
    reloadSummary();
    reloadLatest();
    reloadActivity();
    reloadHealth();
    reloadTeam();
    reloadHistory();
    reloadUsage();
  }, [
    reloadSummary,
    reloadLatest,
    reloadActivity,
    reloadHealth,
    reloadTeam,
    reloadHistory,
    reloadUsage,
  ]);

  const counts = useMemo(() => countsOf(summary.data), [summary.data]);
  const availability = useMemo(
    () => (history.data ? summarizeAvailability(history.data) : null),
    [history.data],
  );
  const firstLoad = summary.loading && !summary.data && !summary.error;

  const statusSegments = useMemo<StatusSegment[]>(
    () => [
      { key: 'ACTIVE', label: COPY.statusActive, count: counts.active, tone: 'success' },
      {
        key: 'PROVISIONING',
        label: COPY.statusProvisioning,
        count: counts.provisioning,
        tone: 'warning',
      },
      { key: 'PROVISIONING_FAILED', label: COPY.statusFailed, count: counts.failed, tone: 'error' },
      { key: 'SUSPENDED', label: COPY.statusSuspended, count: counts.suspended, tone: 'neutral' },
      {
        key: 'INACTIVE',
        label: COPY.statusInactive,
        count: counts.inactive,
        tone: 'neutral',
        hiddenWhenZero: true,
      },
      {
        key: 'MARKED_FOR_DELETION',
        label: COPY.statusMarkedForDeletion,
        count: counts.markedForDeletion,
        tone: 'error',
        hiddenWhenZero: true,
      },
    ],
    [counts],
  );

  const pulseCells = useMemo<PulseCellData[]>(() => {
    const summaryState =
      summary.loading && !summary.data ? 'loading' : summary.error ? 'error' : 'idle';
    const summaryUpdating = summary.loading && summary.data !== null;
    const value = (n: number) => (summary.data ? n : null);
    const attentionParts = [
      counts.failed > 0 ? COPY.attentionPart.PROVISIONING_FAILED(counts.failed) : null,
      counts.suspended > 0 ? COPY.attentionPart.SUSPENDED(counts.suspended) : null,
      counts.markedForDeletion > 0
        ? COPY.attentionPart.MARKED_FOR_DELETION(counts.markedForDeletion)
        : null,
    ].filter((part): part is string => part !== null);

    const period = summary.data?.period;
    const net = period ? period.created - period.removed : 0;
    const oldest = summary.data?.oldestProvisioningAt ?? null;
    const t = team.data;
    const teamMfaPct =
      t && t.total > 0 ? Math.round(((t.total - t.withoutMfa) / t.total) * 100) : null;

    return [
      {
        id: 'active',
        label: COPY.pulseActive,
        value: value(counts.active),
        // Lima solo con neto positivo (CA-PP2-02); neto negativo en neutro, neto 0 sin señal.
        delta:
          period && net !== 0
            ? { label: COPY.pulseMonthDelta(net), tone: net > 0 ? 'progress' : 'neutral' }
            : undefined,
        hint: period
          ? COPY.pulseMonthMovement(period.created, period.removed)
          : summary.data
            ? COPY.pulseActiveHint(summary.data.total)
            : undefined,
        state: summaryState,
        updating: summaryUpdating,
        href: '/tenants?status=ACTIVE',
        onRetry: summary.reload,
      },
      {
        id: 'provisioning',
        label: COPY.pulseProvisioning,
        value: value(counts.provisioning),
        hint:
          counts.provisioning > 0
            ? oldest
              ? COPY.pulseProvisioningOldest(formatRelativeTime(oldest))
              : COPY.pulseProvisioningHintSome
            : COPY.pulseProvisioningHintNone,
        state: summaryState,
        updating: summaryUpdating,
        href: '/tenants?status=PROVISIONING',
        onRetry: summary.reload,
      },
      {
        id: 'attention',
        label: COPY.pulseAttention,
        value: value(counts.attention),
        hint: attentionParts.length > 0 ? attentionParts.join(' · ') : COPY.pulseAttentionHintNone,
        visual:
          counts.attention > 0 ? (
            <StackedBar
              size="sm"
              ariaLabel={attentionParts.join(', ')}
              segments={[
                { key: 'failed', label: COPY.statusFailed, value: counts.failed, tone: 'error' },
                {
                  key: 'suspended',
                  label: COPY.statusSuspended,
                  value: counts.suspended,
                  tone: 'neutral',
                },
                {
                  key: 'deletion',
                  label: COPY.statusMarkedForDeletion,
                  value: counts.markedForDeletion,
                  tone: 'error',
                  emphasis: 'soft',
                },
              ]}
            />
          ) : undefined,
        state: summaryState,
        updating: summaryUpdating,
        // Sin destino único en /tenants: lleva al desglose del área Empresas.
        onClick: focusCompanies,
        onRetry: summary.reload,
      },
      {
        // P2: peor componente en 30 días, solo con muestras reales (CA-PP3-02).
        id: 'availability',
        label: COPY.pulseAvailability,
        value: availability?.availability ?? null,
        formatValue: formatPercent,
        delta:
          availability?.availability != null
            ? availability.availability >= 1
              ? { label: COPY.availabilityOk, tone: 'success' }
              : { label: COPY.availabilityDegraded, tone: 'warning' }
            : undefined,
        hint: availability
          ? availability.availability === null
            ? COPY.availabilityNoSamples
            : availability.daysWithoutData > 0
              ? COPY.availabilityDaysWithoutData(availability.daysWithoutData)
              : availability.worst && availability.availability < 1
                ? COPY.availabilityWorst(COPY.componentShort[availability.worst])
                : undefined
          : undefined,
        visual: availability ? <AvailabilityTracker days={availability.days} /> : undefined,
        state: history.loading && !history.data ? 'loading' : history.error ? 'error' : 'idle',
        updating: history.loading && history.data !== null,
        href: `#${HEALTH_ANCHOR}`,
        onRetry: history.reload,
      },
      {
        id: 'team',
        label: COPY.pulseTeam,
        value: t ? t.total : null,
        hint: t ? COPY.pulseTeamWithoutMfa(t.withoutMfa) : undefined,
        visual:
          teamMfaPct !== null ? (
            <ProgressMeter
              compact
              value={teamMfaPct}
              ariaLabel={COPY.pulseTeamMfaMeter(teamMfaPct)}
            />
          ) : undefined,
        state: team.loading && !t ? 'loading' : team.error ? 'error' : 'idle',
        updating: team.loading && t !== null,
        href: '/platform-users',
        onRetry: team.reload,
      },
    ];
  }, [counts, summary, team, history, availability, focusCompanies]);

  const queueRows = useMemo<AttentionRow[]>(() => {
    const rows: AttentionRow[] = [];
    for (const item of summary.data?.attention ?? []) {
      rows.push({
        id: `tenant-${item.id}`,
        severity: item.status === TenantStatus.PROVISIONING_FAILED ? 'at-risk' : 'attention',
        title: TENANT_ATTENTION_TITLE[item.status] ?? COPY.queueAttention,
        area: `${item.name} · ${formatRelativeTime(item.updatedAt)}`,
        href: `/tenants/${item.id}/settings`,
      });
    }
    const h = health.data;
    if (h) {
      const down: Array<[string, boolean]> = [
        [COPY.healthDbLabel, h.db !== 'ok'],
        [COPY.healthRedisLabel, h.redis !== 'ok'],
      ];
      for (const [label, isDown] of down) {
        if (!isDown) continue;
        rows.push({
          id: `service-${label}`,
          severity: 'at-risk',
          title: COPY.queueServiceDown(label),
          area: COPY.queueHealthArea,
          href: `#${HEALTH_ANCHOR}`,
        });
      }
    }
    const work = summarizeWorkQueues(history.data?.queues);
    if (work.state !== 'clear') {
      rows.push({
        id: 'work-queues',
        severity: 'attention',
        title:
          work.state === 'failed'
            ? COPY.queueWorkFailed(work.failedTotal)
            : COPY.queueWorkBacklog(work.waitingTotal),
        area: COPY.queueWorkArea(work.withNews.length),
        href: `#${QUEUES_ANCHOR}`,
      });
    }
    const withoutMfa = team.data?.withoutMfa ?? 0;
    if (withoutMfa > 0) {
      rows.push({
        id: 'users-without-mfa',
        severity: 'attention',
        title: COPY.queueUsersWithoutMfa(withoutMfa),
        area: COPY.queueUsersArea,
        href: '/platform-users',
      });
    }
    // En riesgo antes que Atención; estable dentro de cada severidad.
    return [
      ...rows.filter((row) => row.severity === 'at-risk'),
      ...rows.filter((row) => row.severity === 'attention'),
    ];
  }, [summary.data, health.data, history.data, team.data]);

  const queueLoading = (summary.loading && !summary.data) || (health.loading && !health.data);

  const recentItems = useMemo(
    () =>
      (activity.data?.data ?? []).slice(0, ACTIVITY_VISIBLE).map((entry) => ({
        id: entry.id,
        label: describePlatformActivityLine(entry),
        dateTime: entry.createdAt,
        relative: formatRelativeTime(entry.createdAt),
      })),
    [activity.data],
  );

  const generatedAt = summary.data?.generatedAt;

  return (
    <div className="space-y-5">
      <PageHeader
        title={COPY.title}
        subtitle={
          generatedAt ? COPY.lastReading(formatRelativeTime(generatedAt)) : COPY.lastReadingPending
        }
        actions={
          <Button type="button" variant="secondary" size="sm" onClick={refreshAll}>
            <RefreshCw className="h-4 w-4" aria-hidden={true} />
            {COPY.refresh}
          </Button>
        }
      />

      {firstLoad ? <span className="sr-only">{COPY.loading}</span> : null}

      {/* B1 · Pulso */}
      <PulseStrip
        cells={pulseCells}
        ariaLabel={COPY.pulseAriaLabel}
        labels={PULSE_LABELS}
        linkComponent={Link}
      />

      {/* B2 · Tendencia (8) + Requiere tu atención (4); la cola va primero en el DOM (lectura y móvil). */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
        <div className="xl:order-last xl:col-span-4">
          <AttentionQueue
            state={queueLoading ? 'loading' : 'ready'}
            rows={queueRows}
            partial={summary.error || health.error}
            onRetry={() => {
              if (summary.error) summary.reload();
              if (health.error) health.reload();
            }}
            title={COPY.queueTitle}
            description={COPY.queueDescription}
            labels={QUEUE_LABELS}
            linkComponent={Link}
          />
        </div>
        <div className="xl:col-span-8">
          <TenantTrendPanel
            monthly={summary.data?.monthly ?? null}
            currentMonth={summary.data?.period.month ?? null}
            isLoading={summary.loading && !summary.data}
            updating={summary.loading && summary.data !== null}
            error={summary.error}
            onRetry={summary.reload}
          />
        </div>
      </div>

      {/* B3 · Una card por área: Empresas, Salud, Usuarios internos, Colas y, por rol, Uso por empresa.
          Con 5 áreas: 3 + 2 en xl (rejilla de 6), para no estrechar las tablas. */}
      <div
        className={
          showUsage
            ? 'grid grid-cols-1 items-stretch gap-5 md:grid-cols-2 xl:grid-cols-6 xl:[&>*:nth-child(-n+3)]:col-span-2 xl:[&>*:nth-child(n+4)]:col-span-3'
            : 'grid grid-cols-1 items-stretch gap-5 md:grid-cols-2 2xl:grid-cols-4'
        }
      >
        <TenantStatusDistribution
          density="compact"
          titleRef={companiesHeadingRef}
          segments={statusSegments}
          isLoading={summary.loading && !summary.data}
          error={summary.error ? COPY.directoryError : null}
          onRetry={summary.reload}
        />
        <SystemStatusPanel
          id={HEALTH_ANCHOR}
          density="compact"
          className="h-full"
          title={COPY.healthTitle}
          eyebrow={COPY.healthEyebrow}
          lastCheckedAt={health.data?.timestamp ?? null}
          isLoading={health.loading && !health.data}
          error={health.error ? COPY.healthError : null}
          onRetry={health.reload}
          emptyMessage={COPY.healthNoReading}
          statusLabels={SYSTEM_STATUS_LABELS}
          indicators={buildHealthIndicators(health.data)}
        >
          {history.error ? (
            <p className="mt-3 text-xs text-gray-600 dark:text-gray-300">{COPY.trackerError}</p>
          ) : availability ? (
            <AvailabilityTracker className="mt-3" size="md" days={availability.days} />
          ) : null}
        </SystemStatusPanel>
        <PlatformUsersArea
          summary={team.data}
          isLoading={team.loading && !team.data}
          error={team.error}
          onRetry={team.reload}
        />
        <WorkQueuesArea
          queues={history.data?.queues ?? null}
          sampledAt={history.data?.queuesSampledAt ?? null}
          isLoading={history.loading && !history.data}
          error={history.error}
          onRetry={history.reload}
        />
        {showUsage ? (
          <TenantUsageArea
            className="md:col-span-2 xl:col-span-3"
            items={usage.data?.items ?? null}
            isLoading={usage.loading && !usage.data}
            error={usage.error}
            onRetry={usage.reload}
          />
        ) : null}
      </div>

      {/* B4 · Últimas empresas (7) + Actividad reciente (5) */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <LatestTenantsPanel
            tenants={latest.data ?? []}
            isLoading={latest.loading && !latest.data}
            error={latest.error ? COPY.latestError : null}
            onRetry={latest.reload}
          />
        </div>
        <div className="xl:col-span-5">
          <RecentActivityPanel
            items={recentItems}
            isLoading={activity.loading && !activity.data}
            error={activity.error ? COPY.activityError : null}
            onRetry={activity.reload}
          />
        </div>
      </div>
    </div>
  );
}
