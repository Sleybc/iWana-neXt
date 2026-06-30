'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@iwana/ui';
import { ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { TenantsTable } from '@/components/dashboard/TenantsTable';
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

function describeAuditEntry(entry: PlatformAuditLogEntry): string {
  const actorName = entry.actor?.displayName?.trim() || 'Equipo de plataforma';
  const action = entry.action.toLowerCase().replace(/_/g, ' ');
  const entity =
    entry.entityType === 'tenant'
      ? 'empresa'
      : entry.entityType === 'user'
        ? 'usuario'
        : entry.entityType.toLowerCase().replace(/_/g, ' ');

  return `${actorName} · ${action} en ${entity}`;
}

export function DashboardClient() {
  const searchParams = useSearchParams();
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentAudit, setRecentAudit] = useState<PlatformAuditLogEntry[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthStatusResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

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

  const globalQuery = useMemo(
    () => searchParams.get('q')?.trim().toLowerCase() ?? '',
    [searchParams],
  );

  const visibleTenants = useMemo(() => {
    if (!globalQuery) {
      return tenants;
    }

    return tenants.filter((tenant) => {
      return (
        tenant.name.toLowerCase().includes(globalQuery) ||
        tenant.slug.toLowerCase().includes(globalQuery) ||
        tenant.status.toLowerCase().includes(globalQuery)
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
      visibleTenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        contactEmail: tenant.contactEmail,
        updatedAt: tenant.updatedAt,
        createdAt: tenant.createdAt,
      })),
    [visibleTenants],
  );

  const healthIndicators = useMemo(() => {
    return [
      {
        label: 'API de plataforma',
        status: error ? 'warning' : health?.status === 'ok' ? 'ok' : health ? 'warning' : 'unknown',
        detail: error
          ? 'No pudimos cargar el directorio principal.'
          : health?.status === 'ok'
            ? 'Disponible para el equipo interno.'
            : health
              ? 'Disponible con validaciones pendientes.'
              : healthError ?? 'Pendiente de integración.',
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
      {
        label: 'Atención operativa',
        status: summary.attention > 0 ? 'warning' : 'ok',
        detail:
          summary.attention > 0
            ? `${summary.attention} empresas requieren revisión.`
            : 'Sin alertas principales en empresas.',
      },
    ] as const;
  }, [error, health, healthError, summary.attention, summary.provisioning, summary.total]);

  const healthSummary = health
    ? health.status === 'ok'
      ? 'API, base de datos y Redis responden correctamente.'
      : 'La plataforma responde, pero hay servicios que requieren seguimiento.'
    : healthError ?? 'Salud de plataforma pendiente de integración.';

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
              className="rounded-2xl border border-gray-200 bg-iwana-surface-soft/70 p-5 shadow-sm dark:border-dark-border dark:bg-dark-surface-2"
            >
              <p className="portal-eyebrow">Resumen operativo</p>
              <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <h2 className="text-xl font-semibold text-iwana-primary dark:text-white">
                    {summary.active} empresas activas y {summary.attention} en seguimiento directo
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                    Usa esta portada para priorizar altas pendientes, revisar empresas con alertas y
                    entrar rápido al historial cuando cambie algo importante.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/80 bg-white px-4 py-3 shadow-sm dark:border-dark-border dark:bg-dark-surface-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Empresas visibles
                    </p>
                    <p className="mt-1 text-lg font-semibold text-iwana-primary dark:text-white">
                      {visibleTenants.length}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/80 bg-white px-4 py-3 shadow-sm dark:border-dark-border dark:bg-dark-surface-3">
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Cambios esta semana
                    </p>
                    <p className="mt-1 text-lg font-semibold text-iwana-primary dark:text-white">
                      {summary.updatedLast7Days}
                    </p>
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
              />
            </section>
          </div>

          <div className="xl:col-span-4 flex flex-col gap-6">
            <SystemStatusPanel
              title="Salud de plataforma"
              summary={healthSummary}
              lastCheckedAt={health?.timestamp ?? null}
              indicators={healthIndicators.map((indicator) => ({ ...indicator }))}
            />

            <PanelCard
              title="Actividad reciente"
              columnHeaders={{ label: 'Evento', value: 'Hace' }}
              rows={
                auditError
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
              rows={[
                {
                  label: 'Activas',
                  value: summary.active,
                  valueClassName: 'text-green-700 dark:text-green-400',
                },
                {
                  label: 'En configuración',
                  value: summary.provisioning,
                  valueClassName: 'text-amber-700 dark:text-amber-400',
                },
                {
                  label: 'Con error',
                  value: summary.failed,
                  valueClassName: 'text-red-600 dark:text-red-400',
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
