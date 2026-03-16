'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Building2, Users, BriefcaseBusiness, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { TenantsTable } from '@/components/dashboard/TenantsTable';
import { PanelCard } from '@/components/dashboard/PanelCard';
import { SystemStatusPanel } from '@/components/dashboard/SystemStatusPanel';
import { tenantApi, type TenantListItem, ApiError } from '@/lib/api-client';

function formatRelativeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'reciente';
  }

  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60)));
  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  return `${Math.floor(diffHours / 24)}d`;
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

export function DashboardClient() {
  const searchParams = useSearchParams();
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTenants = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await tenantApi.list({ limit: 100, offset: 0 });
      setTenants(response);
    } catch (err) {
      setError(mapError(err));
      setTenants([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  const summary = useMemo(() => {
    const active = tenants.filter((tenant) => tenant.status === 'ACTIVE').length;
    const provisioning = tenants.filter((tenant) => tenant.status === 'PROVISIONING').length;
    const failed = tenants.filter((tenant) => tenant.status === 'PROVISIONING_FAILED').length;
    const suspended = tenants.filter((tenant) => tenant.status === 'SUSPENDED').length;

    return {
      total: tenants.length,
      active,
      provisioning,
      failed,
      suspended,
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
    return [...visibleTenants]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 4)
      .map((tenant) => {
        const valueClassName =
          tenant.status === 'PROVISIONING_FAILED'
            ? 'text-red-600 dark:text-red-400'
            : tenant.status === 'ACTIVE'
              ? 'text-green-700 dark:text-green-400'
              : null;

        return {
          label: `Tenant "${tenant.name}" — ${tenant.status.toLowerCase()}`,
          value: formatRelativeDate(tenant.updatedAt),
          ...(valueClassName ? { valueClassName } : {}),
        };
      });
  }, [visibleTenants]);

  const tableRows = useMemo(
    () =>
      visibleTenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        createdAt: tenant.createdAt,
      })),
    [visibleTenants],
  );

  return (
    <div className="flex flex-col flex-1">
      <PageHeader title="Dashboard" subtitle="Resumen de la plataforma iWana neXt" />

      <main className="flex-1 p-6">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div className="xl:col-span-8 flex flex-col gap-6">
            <section aria-label="Métricas de plataforma">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                <MetricCard
                  title="Total tenants"
                  value={isLoading ? '...' : String(summary.total)}
                  change="Desde endpoint /tenants"
                  icon={<Building2 className="w-5 h-5" />}
                  iconBg="#EAF5CC"
                  iconColor="#6A7A1C"
                />
                <MetricCard
                  title="Activos"
                  value={isLoading ? '...' : String(summary.active)}
                  change="Tenants activos"
                  icon={<Users className="w-5 h-5" />}
                  iconBg="#EEEEFA"
                  iconColor="#17163A"
                  {...(!isLoading && {
                    trend: {
                      value: summary.total > 0 ? (summary.active / summary.total) * 100 : 0,
                      direction: summary.active > summary.total / 2 ? 'up' : 'down',
                      label: 'del total',
                    },
                  })}
                />
                <MetricCard
                  title="Provisionando"
                  value={isLoading ? '...' : String(summary.provisioning)}
                  change="Tenants en provisioning"
                  icon={<BriefcaseBusiness className="w-5 h-5" />}
                  iconBg="#DCFCE7"
                  iconColor="#22C55E"
                  {...(!isLoading && {
                    trend: {
                      value: summary.total > 0 ? (summary.provisioning / summary.total) * 100 : 0,
                      direction: summary.provisioning > 0 ? 'up' : 'neutral',
                      label: 'del total',
                    },
                  })}
                />
                <MetricCard
                  title="Suspendidos"
                  value={isLoading ? '...' : String(summary.suspended)}
                  change="Errores + suspendidos"
                  icon={<AlertTriangle className="w-5 h-5" />}
                  iconBg="#FEF2F2"
                  iconColor="#EF4444"
                  {...(!isLoading && {
                    trend: {
                      value: summary.total > 0 ? (summary.suspended / summary.total) * 100 : 0,
                      direction: summary.suspended > 0 ? 'down' : 'neutral',
                      label: 'del total',
                    },
                  })}
                />
              </div>
            </section>

            <section aria-label="Tenants de la plataforma">
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
              indicators={[
                {
                  label: 'API Gateway',
                  status: error ? 'warning' : 'ok',
                  detail: error ? 'Error consultando API' : 'Conectado',
                },
                {
                  label: 'Base de datos',
                  status: error ? 'warning' : 'ok',
                  detail: `${visibleTenants.length} visibles de ${summary.total}`,
                },
                {
                  label: 'BullMQ / Redis',
                  status: summary.provisioning > 0 ? 'warning' : 'ok',
                  detail: `${summary.provisioning} en provisioning`,
                },
                {
                  label: 'Provisioning',
                  status: summary.failed > 0 ? 'error' : 'ok',
                  detail: `${summary.failed} con error`,
                },
              ]}
            />

            <PanelCard
              title="Actividad reciente"
              columnHeaders={{ label: 'Evento', value: 'Hace' }}
              rows={
                recentRows.length > 0
                  ? recentRows
                  : [{ label: 'Sin actividad reciente', value: '-' }]
              }
              footerLabel="Ver historial completo"
              footerHref="/audit"
            />

            <PanelCard
              title="Distribución de tenants"
              columnHeaders={{ label: 'Estado', value: 'Cantidad' }}
              rows={[
                {
                  label: 'Activos',
                  value: summary.active,
                  valueClassName: 'text-green-700 dark:text-green-400',
                },
                {
                  label: 'Provisionando',
                  value: summary.provisioning,
                  valueClassName: 'text-amber-700 dark:text-amber-400',
                },
                {
                  label: 'Error',
                  value: summary.failed,
                  valueClassName: 'text-red-600 dark:text-red-400',
                },
                { label: 'Suspendidos', value: summary.suspended },
              ]}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
