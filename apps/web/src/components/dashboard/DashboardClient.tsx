'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { RecentActivityPanel } from '@/components/dashboard/RecentActivityPanel';
import { SignalChips, type SignalChipModel } from '@/components/dashboard/SignalChips';
import { SystemStatusPanel } from '@/components/dashboard/SystemStatusPanel';
import {
  TenantStatusDistribution,
  type StatusSegment,
} from '@/components/dashboard/TenantStatusDistribution';
import {
  ApiError,
  healthApi,
  platformAuditApi,
  tenantApi,
  type HealthStatusResponse,
  type PlatformAuditLogEntry,
  type TenantListItem,
} from '@/lib/api-client';
import { describePlatformActivityLine } from '@/lib/platform-audit-vocabulary';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

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

function isWithinDays(value: string, days: number): boolean {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return Date.now() - date.getTime() <= days * 24 * 60 * 60 * 1000;
}

function mapOperationalError(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

export function DashboardClient() {
  const statusHeadingRef = useRef<HTMLHeadingElement>(null);
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentAudit, setRecentAudit] = useState<PlatformAuditLogEntry[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthStatusResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setAuditError(null);
    setHealthError(null);

    const [tenantsResult, auditResult, healthResult] = await Promise.allSettled([
      tenantApi.list({ limit: 100, offset: 0 }),
      platformAuditApi.list({ limit: 5 }),
      healthApi.get(),
    ]);

    if (tenantsResult.status === 'fulfilled') {
      setTenants(tenantsResult.value);
    } else {
      setError(PLATFORM_UI_COPY.dashboard.directoryError);
      setTenants([]);
    }

    if (auditResult.status === 'fulfilled') {
      const auditPayload = auditResult.value;
      setRecentAudit(Array.isArray(auditPayload) ? auditPayload : (auditPayload?.data ?? []));
      setAuditError(null);
    } else {
      setRecentAudit([]);
      setAuditError(PLATFORM_UI_COPY.dashboard.activityError);
    }

    if (healthResult.status === 'fulfilled') {
      setHealth(healthResult.value);
      setHealthError(null);
    } else {
      setHealth(null);
      setHealthError(
        mapOperationalError(
          healthResult.reason,
          'No pudimos validar API, base de datos y Redis en este momento.',
        ),
      );
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const summary = useMemo(() => {
    const active = tenants.filter((tenant) => tenant.status === 'ACTIVE').length;
    const provisioning = tenants.filter((tenant) => tenant.status === 'PROVISIONING').length;
    const failed = tenants.filter((tenant) => tenant.status === 'PROVISIONING_FAILED').length;
    const suspended = tenants.filter((tenant) => tenant.status === 'SUSPENDED').length;
    const inactive = tenants.filter((tenant) => tenant.status === 'INACTIVE').length;
    const markedForDeletion = tenants.filter(
      (tenant) => tenant.status === 'MARKED_FOR_DELETION',
    ).length;
    const updatedLast7Days = tenants.filter((tenant) => isWithinDays(tenant.updatedAt, 7)).length;

    return {
      total: tenants.length,
      active,
      provisioning,
      failed,
      suspended,
      inactive,
      markedForDeletion,
      updatedLast7Days,
      attention: failed + suspended + inactive + markedForDeletion,
    };
  }, [tenants]);

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
        label: PLATFORM_UI_COPY.dashboard.chipActive,
        count: summary.active,
        accent: 'primary',
        href: '/tenants?status=ACTIVE',
        ariaLabel: PLATFORM_UI_COPY.dashboard.viewActiveCompanies,
      },
      {
        id: 's2',
        label: PLATFORM_UI_COPY.dashboard.chipProvisioning,
        count: summary.provisioning,
        accent: 'warning',
        href: '/tenants?status=PROVISIONING',
        ariaLabel: PLATFORM_UI_COPY.dashboard.viewProvisioningCompanies,
      },
      {
        id: 's3',
        label: PLATFORM_UI_COPY.dashboard.chipAttention,
        count: summary.attention,
        accent: 'danger',
        ariaLabel: PLATFORM_UI_COPY.dashboard.viewStatusBreakdown,
        onActivate: focusStatusBreakdown,
      },
      {
        id: 's4',
        label: PLATFORM_UI_COPY.dashboard.chipWeeklyChanges,
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
        label: PLATFORM_UI_COPY.dashboard.statusActive,
        count: summary.active,
        tone: 'success',
      },
      {
        key: 'PROVISIONING',
        label: PLATFORM_UI_COPY.dashboard.statusProvisioning,
        count: summary.provisioning,
        tone: 'warning',
      },
      {
        key: 'PROVISIONING_FAILED',
        label: PLATFORM_UI_COPY.dashboard.statusFailed,
        count: summary.failed,
        tone: 'error',
      },
      {
        key: 'SUSPENDED',
        label: PLATFORM_UI_COPY.dashboard.statusSuspended,
        count: summary.suspended,
        tone: 'neutral',
      },
      {
        key: 'INACTIVE',
        label: PLATFORM_UI_COPY.dashboard.statusInactive,
        count: summary.inactive,
        tone: 'neutral',
        hiddenWhenZero: true,
      },
      {
        key: 'MARKED_FOR_DELETION',
        label: PLATFORM_UI_COPY.dashboard.statusMarkedForDeletion,
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
      recentAudit.slice(0, 5).map((entry) => ({
        id: entry.id,
        label: describePlatformActivityLine(entry),
        dateTime: entry.createdAt,
        relative: formatRelativeDate(entry.createdAt),
      })),
    [recentAudit],
  );

  const healthIndicators = useMemo(() => {
    return [
      {
        label: 'Atención operativa',
        status: summary.attention > 0 ? 'warning' : 'ok',
        detail:
          summary.attention > 0
            ? `${summary.attention} empresas requieren revisión.`
            : 'Sin alertas principales en empresas.',
      },
      {
        label: 'API de plataforma',
        status: error ? 'warning' : health?.status === 'ok' ? 'ok' : health ? 'warning' : 'unknown',
        detail: error
          ? 'No pudimos cargar el directorio principal.'
          : health?.status === 'ok'
            ? 'Disponible para el equipo interno.'
            : health
              ? 'Disponible con validaciones pendientes.'
              : (healthError ?? 'Pendiente de integración.'),
      },
      {
        label: 'Base de datos',
        status: health?.db === 'ok' ? 'ok' : health ? 'error' : 'unknown',
        detail:
          health?.db === 'ok'
            ? `${summary.total} empresas registradas.`
            : health
              ? 'Requiere revisión.'
              : 'Sin lectura directa todavía.',
      },
      {
        label: 'Redis y colas',
        status:
          health?.redis === 'ok'
            ? summary.provisioning > 0
              ? 'warning'
              : 'ok'
            : health
              ? 'error'
              : 'unknown',
        detail:
          summary.provisioning > 0
            ? `${summary.provisioning} puestas en marcha en seguimiento.`
            : health?.redis === 'ok'
              ? 'Sin acumulación visible.'
              : health
                ? 'No disponible.'
                : 'Sin lectura directa todavía.',
      },
    ] as const;
  }, [error, health, healthError, summary.attention, summary.provisioning, summary.total]);

  const healthSummary = health
    ? health.status === 'ok'
      ? 'API, base de datos y Redis responden correctamente.'
      : 'La plataforma responde, pero hay servicios que requieren seguimiento.'
    : (healthError ?? 'Salud de plataforma pendiente de integración.');

  return (
    <div className="space-y-5">
      <PageHeader
        title={PLATFORM_UI_COPY.dashboard.title}
        subtitle={PLATFORM_UI_COPY.dashboard.subtitle}
      />

      <main className="space-y-6">
        {isLoading ? <span className="sr-only">{PLATFORM_UI_COPY.dashboard.loading}</span> : null}

        <SignalChips
          chips={signalChips}
          isLoading={isLoading}
          error={error}
          onRetry={() => {
            void loadDashboard();
          }}
        />

        <div data-testid="control-center-split" className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div data-testid="control-center-monitoring" className="h-full xl:col-span-7">
            <SystemStatusPanel
              className="h-full"
              title="Salud de plataforma"
              summary={healthSummary}
              lastCheckedAt={health?.timestamp ?? null}
              isLoading={isLoading}
              indicators={healthIndicators.map((indicator) => ({ ...indicator }))}
            />
          </div>
          <div data-testid="control-center-distribution" className="h-full xl:col-span-5">
            <TenantStatusDistribution
              segments={statusSegments}
              isLoading={isLoading}
              error={error}
              onRetry={() => {
                void loadDashboard();
              }}
              titleRef={statusHeadingRef}
            />
          </div>
        </div>

        <RecentActivityPanel
          items={recentItems}
          isLoading={isLoading}
          error={auditError}
          onRetry={() => {
            void loadDashboard();
          }}
        />
      </main>
    </div>
  );
}
