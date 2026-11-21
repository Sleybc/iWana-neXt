'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TENANT_ATTENTION_STATUSES, TenantStatus, type TenantStatusSummary } from '@iwana/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { RecentActivityPanel } from '@/components/dashboard/RecentActivityPanel';
import { SignalChips, type SignalChipModel } from '@/components/dashboard/SignalChips';
import { SystemStatusPanel, type StatusIndicator } from '@/components/dashboard/SystemStatusPanel';
import {
  TenantStatusDistribution,
  type StatusSegment,
} from '@/components/dashboard/TenantStatusDistribution';
import {
  healthApi,
  platformAuditApi,
  tenantApi,
  type HealthStatusResponse,
  type PlatformAuditLogEntry,
} from '@/lib/api-client';
import { describePlatformActivityLine } from '@/lib/platform-audit-vocabulary';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

const COPY = PLATFORM_UI_COPY.dashboard;

function formatRelativeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Reciente';
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));

  if (diffMinutes < 60) {
    return diffMinutes === 1 ? 'Hace 1 min' : `Hace ${diffMinutes} min`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return diffHours === 1 ? 'Hace 1 hora' : `Hace ${diffHours} horas`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return diffDays === 1 ? 'Hace 1 día' : `Hace ${diffDays} días`;
}

/** Cada indicador refleja solo su servicio (L-10); «Atención operativa» es la única lectura de negocio. */
function buildHealthIndicators(
  health: HealthStatusResponse | null,
  healthError: string | null,
  attention: number,
): StatusIndicator[] {
  const serviceIndicator = (
    label: string,
    value: string | undefined,
    okDetail: string,
  ): StatusIndicator => {
    if (!health) {
      return { label, status: 'unknown', detail: COPY.healthNoReading };
    }
    return value === 'ok'
      ? { label, status: 'ok', detail: okDetail }
      : { label, status: 'error', detail: COPY.healthUnavailable };
  };

  return [
    {
      label: COPY.healthAttentionLabel,
      status: attention > 0 ? 'warning' : 'ok',
      detail: attention > 0 ? COPY.healthAttentionSome(attention) : COPY.healthAttentionNone,
    },
    health
      ? {
          label: COPY.healthApiLabel,
          status: health.status === 'ok' ? 'ok' : 'warning',
          detail: health.status === 'ok' ? COPY.healthApiOk : COPY.healthApiDegraded,
        }
      : {
          label: COPY.healthApiLabel,
          status: 'unknown',
          detail: healthError ?? COPY.healthNoReading,
        },
    serviceIndicator(COPY.healthDbLabel, health?.db, COPY.healthDbOk),
    serviceIndicator(COPY.healthRedisLabel, health?.redis, COPY.healthRedisOk),
  ];
}

export function DashboardClient() {
  const statusHeadingRef = useRef<HTMLHeadingElement>(null);
  const [tenantSummary, setTenantSummary] = useState<TenantStatusSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentAudit, setRecentAudit] = useState<PlatformAuditLogEntry[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthStatusResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);

    const [summaryResult, auditResult, healthResult] = await Promise.allSettled([
      tenantApi.summary(),
      platformAuditApi.list({ limit: 5 }),
      healthApi.get(),
    ]);

    const summaryOk = summaryResult.status === 'fulfilled';
    setTenantSummary(summaryOk ? summaryResult.value : null);
    setError(summaryOk ? null : COPY.directoryError);

    const auditOk = auditResult.status === 'fulfilled';
    setRecentAudit(auditOk ? auditResult.value.data : []);
    setAuditError(auditOk ? null : COPY.activityError);

    const healthOk = healthResult.status === 'fulfilled';
    setHealth(healthOk ? healthResult.value : null);
    // Un fallo de /health (red, 429/502 de nginx con HTML…) muestra siempre el copy canónico.
    setHealthError(healthOk ? null : COPY.healthError);

    setIsLoading(false);
  }, []);

  const retry = useCallback(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const summary = useMemo(() => {
    const byStatus = tenantSummary?.byStatus;
    const count = (status: TenantStatus) => byStatus?.[status] ?? 0;

    return {
      total: tenantSummary?.total ?? 0,
      active: count(TenantStatus.ACTIVE),
      provisioning: count(TenantStatus.PROVISIONING),
      failed: count(TenantStatus.PROVISIONING_FAILED),
      suspended: count(TenantStatus.SUSPENDED),
      inactive: count(TenantStatus.INACTIVE),
      markedForDeletion: count(TenantStatus.MARKED_FOR_DELETION),
      updatedLast7Days: tenantSummary?.updatedLast7Days ?? 0,
      attention: TENANT_ATTENTION_STATUSES.reduce((sum, key) => sum + count(TenantStatus[key]), 0),
    };
  }, [tenantSummary]);

  const focusStatusBreakdown = useCallback(() => {
    const heading = statusHeadingRef.current;
    if (!heading) {
      return;
    }

    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    heading.focus({ preventScroll: reduceMotion });
    if (!reduceMotion && typeof heading.scrollIntoView === 'function') {
      heading.scrollIntoView({ block: 'nearest' });
    }
  }, []);

  const signalChips = useMemo<SignalChipModel[]>(
    () => [
      {
        id: 's1',
        label: COPY.chipActive,
        count: summary.active,
        accent: 'primary',
        href: '/tenants?status=ACTIVE',
        ariaLabel: COPY.viewActiveCompanies,
      },
      {
        id: 's2',
        label: COPY.chipProvisioning,
        count: summary.provisioning,
        accent: 'warning',
        href: '/tenants?status=PROVISIONING',
        ariaLabel: COPY.viewProvisioningCompanies,
      },
      {
        id: 's3',
        label: COPY.chipAttention,
        count: summary.attention,
        accent: 'danger',
        ariaLabel: COPY.viewStatusBreakdown,
        onActivate: focusStatusBreakdown,
      },
      {
        id: 's4',
        label: COPY.chipWeeklyChanges,
        count: summary.updatedLast7Days,
        accent: 'neutral',
      },
    ],
    [
      focusStatusBreakdown,
      summary.active,
      summary.attention,
      summary.provisioning,
      summary.updatedLast7Days,
    ],
  );

  const statusSegments = useMemo<StatusSegment[]>(
    () => [
      {
        key: 'ACTIVE',
        label: COPY.statusActive,
        count: summary.active,
        tone: 'success',
      },
      {
        key: 'PROVISIONING',
        label: COPY.statusProvisioning,
        count: summary.provisioning,
        tone: 'warning',
      },
      {
        key: 'PROVISIONING_FAILED',
        label: COPY.statusFailed,
        count: summary.failed,
        tone: 'error',
      },
      {
        key: 'SUSPENDED',
        label: COPY.statusSuspended,
        count: summary.suspended,
        tone: 'neutral',
      },
      {
        key: 'INACTIVE',
        label: COPY.statusInactive,
        count: summary.inactive,
        tone: 'neutral',
        hiddenWhenZero: true,
      },
      {
        key: 'MARKED_FOR_DELETION',
        label: COPY.statusMarkedForDeletion,
        count: summary.markedForDeletion,
        tone: 'error',
        hiddenWhenZero: true,
      },
    ],
    [
      summary.active,
      summary.failed,
      summary.inactive,
      summary.markedForDeletion,
      summary.provisioning,
      summary.suspended,
    ],
  );

  const recentItems = useMemo(
    () =>
      recentAudit.map((entry) => ({
        id: entry.id,
        label: describePlatformActivityLine(entry),
        dateTime: entry.createdAt,
        relative: formatRelativeDate(entry.createdAt),
      })),
    [recentAudit],
  );

  const healthIndicators = useMemo(
    () => buildHealthIndicators(health, healthError, summary.attention),
    [health, healthError, summary.attention],
  );

  const healthSummary = health
    ? health.status === 'ok'
      ? COPY.healthSummaryOk
      : COPY.healthSummaryDegraded
    : (healthError ?? COPY.healthSummaryPending);

  return (
    <div className="space-y-5">
      <PageHeader title={COPY.title} subtitle={COPY.subtitle} />

      <div className="space-y-6">
        {isLoading ? <span className="sr-only">{COPY.loading}</span> : null}

        <SignalChips chips={signalChips} isLoading={isLoading} error={error} onRetry={retry} />

        <div data-testid="control-center-split" className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div data-testid="control-center-monitoring" className="h-full xl:col-span-7">
            <SystemStatusPanel
              className="h-full"
              title={COPY.healthTitle}
              summary={healthSummary}
              lastCheckedAt={health?.timestamp ?? null}
              isLoading={isLoading}
              indicators={healthIndicators}
            />
          </div>
          <div data-testid="control-center-distribution" className="h-full xl:col-span-5">
            <TenantStatusDistribution
              segments={statusSegments}
              isLoading={isLoading}
              error={error}
              onRetry={retry}
              titleRef={statusHeadingRef}
            />
          </div>
        </div>

        <RecentActivityPanel
          items={recentItems}
          isLoading={isLoading}
          error={auditError}
          onRetry={retry}
        />
      </div>
    </div>
  );
}
