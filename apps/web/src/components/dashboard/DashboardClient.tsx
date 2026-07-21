'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button, SkeletonBlock } from '@iwana/ui';
import { ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { TenantsTable, type StatusFilterValue } from '@/components/dashboard/TenantsTable';
import { PanelCard } from '@/components/dashboard/PanelCard';
import { SystemStatusPanel } from '@/components/dashboard/SystemStatusPanel';
import {
  ApiError,
  healthApi,
  platformAuditApi,
  tenantApi,
  type HealthStatusResponse,
  type PlatformAuditLogEntry,
  type TenantListItem,
} from '@/lib/api-client';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

const DIRECTORY_STATUS_BY_LABEL: Record<string, StatusFilterValue> = {
  Activas: 'ACTIVE',
  'En configuración': 'PROVISIONING',
  'Con error': 'PROVISIONING_FAILED',
  Suspendidas: 'SUSPENDED',
};

function formatRelativeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Reciente';
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));

  if (diffMinutes < 60) {
    return `Hace ${diffMinutes} min`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Hace ${diffHours} h`;
  }

  return `Hace ${Math.floor(diffHours / 24)} d`;
}

function isWithinDays(value: string, days: number): boolean {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return Date.now() - date.getTime() <= days * 24 * 60 * 60 * 1000;
}

function mapError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return 'Tu sesión expiró. Inicia sesión nuevamente.';
    }

    return error.message;
  }

  return 'No fue posible cargar el dashboard.';
}

function mapOperationalError(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

function humanizeToken(value: string): string {
  const normalized = value.toLowerCase().replace(/_/g, ' ').trim();
  if (!normalized) {
    return value;
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function describeAuditEntry(entry: PlatformAuditLogEntry): string {
  const actorName = entry.actor?.displayName?.trim() || 'Equipo de plataforma';
  const actionKey = entry.action.toLowerCase() as keyof typeof PLATFORM_UI_COPY.audit.actionLabels;
  const action = PLATFORM_UI_COPY.audit.actionLabels[actionKey] ?? humanizeToken(entry.action);
  const entityKey =
    entry.entityType.toLowerCase() as keyof typeof PLATFORM_UI_COPY.audit.entityTypeLabels;
  const entity =
    PLATFORM_UI_COPY.audit.entityTypeLabels[entityKey] ??
    entry.entityType.toLowerCase().replace(/_/g, ' ');

  return `${actorName} · ${action} en ${entity}`;
}

export function DashboardClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentAudit, setRecentAudit] = useState<PlatformAuditLogEntry[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthStatusResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('TODAS');

  const loadTenants = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setAuditError(null);
    setHealthError(null);

    const [tenantsResult, auditResult, healthResult] = await Promise.allSettled([
      tenantApi.list({ limit: 100, offset: 0 }),
      platformAuditApi.list({ limit: 10 }),
      healthApi.get(),
    ]);

    if (tenantsResult.status === 'fulfilled') {
      setTenants(tenantsResult.value);
    } else {
      setError(mapError(tenantsResult.reason));
      setTenants([]);
    }

    if (auditResult.status === 'fulfilled') {
      const auditPayload = auditResult.value;
      setRecentAudit(Array.isArray(auditPayload) ? auditPayload : (auditPayload?.data ?? []));
      setAuditError(null);
    } else {
      setRecentAudit([]);
      setAuditError(
        mapOperationalError(auditResult.reason, 'No pudimos cargar la actividad reciente.'),
      );
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
    loadTenants();
  }, [loadTenants]);

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

  const globalQuery = searchParams.get('q') ?? '';

  const handleSearchChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = value.trim();
      if (trimmed) {
        params.set('q', value);
      } else {
        params.delete('q');
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const visibleTenants = useMemo(() => {
    const q = globalQuery.trim().toLowerCase();
    if (!q) {
      return tenants;
    }

    return tenants.filter((tenant) => {
      return (
        tenant.name.toLowerCase().includes(q) ||
        tenant.slug.toLowerCase().includes(q) ||
        tenant.status.toLowerCase().includes(q)
      );
    });
  }, [tenants, globalQuery]);

  const recentRows = useMemo(() => {
    return recentAudit.slice(0, 5).map((entry) => ({
      label: describeAuditEntry(entry),
      value: formatRelativeDate(entry.createdAt),
    }));
  }, [recentAudit]);

  const tableRows = useMemo(
    () =>
      tenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        contactEmail: tenant.contactEmail,
        updatedAt: tenant.updatedAt,
        createdAt: tenant.createdAt,
      })),
    [tenants],
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

  const handleDirectoryRowClick = (rowLabel: string) => {
    const nextStatus = DIRECTORY_STATUS_BY_LABEL[rowLabel];
    if (nextStatus) {
      setStatusFilter(nextStatus);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={PLATFORM_UI_COPY.dashboard.title}
        subtitle="Sigue la salud de plataforma, la puesta en marcha de empresas y los cambios recientes del equipo interno."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/audit-logs">Ver historial</Link>
            </Button>
            <Button asChild>
              <Link href="/tenants">
                Revisar empresas
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </>
        }
      />

      <main>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div className="xl:col-span-8 flex flex-col gap-6">
            <section
              aria-label="Resumen operativo del día"
              aria-busy={isLoading}
              className="rounded-2xl border border-gray-200 bg-iwana-surface-soft/70 p-5 shadow-iwana dark:border-dark-border dark:bg-dark-surface-2"
            >
              <p className="portal-eyebrow">Resumen operativo</p>
              <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  {isLoading ? (
                    <div>
                      <span className="sr-only">Cargando resumen operativo...</span>
                      <SkeletonBlock className="h-7 w-72 rounded-lg bg-gray-200" />
                    </div>
                  ) : (
                    <h2 className="text-xl font-semibold text-iwana-primary dark:text-white">
                      {summary.active} empresas activas y {summary.attention} en seguimiento directo
                    </h2>
                  )}
                  <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                    Usa esta portada para priorizar altas pendientes, revisar empresas con alertas y
                    entrar rápido al historial cuando cambie algo importante.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/80 bg-white px-4 py-3 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Empresas visibles
                    </p>
                    {isLoading ? (
                      <SkeletonBlock className="mt-1 h-7 w-12 rounded-lg bg-gray-200" />
                    ) : (
                      <p className="mt-1 text-lg font-semibold text-iwana-primary dark:text-white">
                        {visibleTenants.length}
                      </p>
                    )}
                  </div>
                  <div className="rounded-2xl border border-white/80 bg-white px-4 py-3 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Cambios esta semana
                    </p>
                    {isLoading ? (
                      <SkeletonBlock className="mt-1 h-7 w-12 rounded-lg bg-gray-200" />
                    ) : (
                      <p className="mt-1 text-lg font-semibold text-iwana-primary dark:text-white">
                        {summary.updatedLast7Days}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section aria-label="Empresas de la plataforma">
              <TenantsTable
                tenants={tableRows}
                isLoading={isLoading}
                error={error}
                onRetry={loadTenants}
                searchQuery={globalQuery}
                onSearchChange={handleSearchChange}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
              />
            </section>
          </div>

          <div className="xl:col-span-4 flex flex-col gap-6">
            <SystemStatusPanel
              title="Salud de plataforma"
              summary={healthSummary}
              lastCheckedAt={health?.timestamp ?? null}
              isLoading={isLoading}
              indicators={healthIndicators.map((indicator) => ({ ...indicator }))}
            />

            <PanelCard
              title="Actividad reciente"
              columnHeaders={{ label: 'Evento', value: 'Hace' }}
              isLoading={isLoading}
              rows={
                isLoading
                  ? []
                  : auditError
                    ? [{ label: auditError, value: '—' }]
                    : recentRows.length > 0
                      ? recentRows
                      : [{ label: 'Aún no hay cambios recientes para mostrar.', value: '—' }]
              }
              footerLabel="Abrir historial completo"
              footerHref="/audit-logs"
            />

            <PanelCard
              title="Directorio por estado"
              columnHeaders={{ label: 'Estado', value: 'Cantidad' }}
              isLoading={isLoading}
              onRowClick={handleDirectoryRowClick}
              rows={[
                {
                  label: 'Activas',
                  value: summary.active,
                  valueClassName: 'text-success-700 dark:text-success-400',
                },
                {
                  label: 'En configuración',
                  value: summary.provisioning,
                  valueClassName: 'text-warning-700 dark:text-warning-400',
                },
                {
                  label: 'Con error',
                  value: summary.failed,
                  valueClassName: 'text-error-600 dark:text-error-400',
                },
                { label: 'Suspendidas', value: summary.suspended },
              ]}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
