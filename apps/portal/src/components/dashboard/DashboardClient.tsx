// apps/portal/src/components/dashboard/DashboardClient.tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import { Users, Activity, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { TenantSummaryCard } from './TenantSummaryCard';
import { MetricCard } from './MetricCard';
import { OnboardingAlerts } from './OnboardingAlerts';
import { RecentActivityPanel } from './RecentActivityPanel';
import { QuickActionsPanel } from './QuickActionsPanel';
import { dashboardApi, ApiError, type DashboardSummary } from '@/lib/api-client';
import { useAuth } from '@/components/auth/AuthProvider';

/**
 * Componente cliente del dashboard empresarial del tenant.
 *
 * Responsabilidades:
 * - Cargar el summary del dashboard desde GET /tenants/me/summary.
 * - Componer la UI role-aware: ADMIN ve todos los bloques; otros roles ven vista reducida.
 * - Manejar estados: loading, error, datos reales y datos null controlados.
 *
 * Boundary: solo consume contratos self-service del tenant — nunca endpoints de plataforma.
 * HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §2.2 (BT-DE-07)
 */

function mapError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente.';
    if (error.status === 403) return 'No tienes permisos para ver el resumen del dashboard.';
    return error.message;
  }
  return 'No fue posible cargar el dashboard. Intenta de nuevo.';
}

/** Skeleton de carga para las métricas */
function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-28 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3"
        />
      ))}
    </div>
  );
}

/** Vista reducida para roles sin acceso al summary completo */
function RoleRestrictedView() {
  return (
    <div className="space-y-6">
      <PageHeader title="Panel empresarial" subtitle="Vista según tus permisos de acceso" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-8 rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-dark-border dark:bg-dark-surface-2">
          <Activity className="mx-auto mb-3 h-10 w-10 text-gray-400" aria-hidden="true" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
            Rol en expansión
          </p>
          <p className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            Panel en preparación
          </p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            El dashboard para tu rol estará disponible próximamente.
          </p>
        </div>
        <div className="xl:col-span-4">
          <QuickActionsPanel />
        </div>
      </div>
    </div>
  );
}

export function DashboardClient() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.role === 'ADMIN';

  const loadSummary = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await dashboardApi.getSummary();
      setSummary(data);
    } catch (err: unknown) {
      setError(mapError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Solo cargar el summary completo si el usuario es ADMIN
    if (isAdmin) {
      void loadSummary();
    } else {
      setIsLoading(false);
    }
  }, [isAdmin, loadSummary]);

  // Vista reducida para roles no ADMIN
  if (!isAdmin) {
    return <RoleRestrictedView />;
  }

  // Estado de carga
  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Panel empresarial" subtitle="Cargando datos de tu empresa..." />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div className="xl:col-span-8 space-y-6">
            <div className="h-40 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
            <MetricsSkeleton />
          </div>
          <div className="xl:col-span-4 space-y-6">
            <div className="h-52 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
            <div className="h-64 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
          </div>
        </div>
      </div>
    );
  }

  // Error de carga
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Panel empresarial" subtitle="Error al cargar el dashboard" />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div className="xl:col-span-8 rounded-2xl border border-red-200/80 bg-[linear-gradient(135deg,rgba(254,242,242,0.98),rgba(254,226,226,0.82))] p-6 shadow-iwana-soft dark:border-red-800 dark:bg-red-900/20">
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-300">{error}</p>
                <button
                  type="button"
                  onClick={() => void loadSummary()}
                  className="mt-2 text-sm font-medium text-red-700 underline decoration-red-300 underline-offset-4 hover:no-underline dark:text-red-400"
                >
                  Reintentar
                </button>
              </div>
            </div>
          </div>
          <div className="xl:col-span-4">
            <QuickActionsPanel />
          </div>
        </div>
      </div>
    );
  }

  // Sin datos (no debería ocurrir si no hay error, pero manejo defensivo)
  if (!summary) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Bienvenido, ${summary.tenant.name}`}
        subtitle="Panel de administración empresarial"
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-8 flex flex-col gap-6">
          <section aria-label="Métricas operativas">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <MetricCard
                label="Usuarios activos"
                value={summary.metrics.configuredUsers}
                icon={Users}
                emptyLabel="Sin datos"
                description="Usuarios con acceso activo al portal"
                tone="primary"
              />
              <MetricCard
                label="Eventos de auditoría"
                value={summary.metrics.auditEventsLast7d}
                icon={Activity}
                emptyLabel="Sin datos"
                description="Últimos 7 días"
                tone="secondary"
              />
              <MetricCard
                label="Alertas pendientes"
                value={summary.metrics.pendingAlerts}
                icon={AlertTriangle}
                description="Configuraciones requeridas"
                tone="warning"
              />
            </div>
          </section>

          <section aria-label="Resumen de la empresa">
            <TenantSummaryCard tenant={summary.tenant} settings={summary.settings} />
          </section>
        </div>

        <div className="xl:col-span-4 flex flex-col gap-6">
          <section aria-label="Alertas de configuración pendiente">
            <OnboardingAlerts alerts={summary.alerts} />
          </section>

          <section aria-label="Actividad reciente">
            <RecentActivityPanel />
          </section>

          <section aria-label="Accesos rápidos a módulos">
            <QuickActionsPanel />
          </section>
        </div>
      </div>
    </div>
  );
}
