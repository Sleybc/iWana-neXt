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
        <div key={i} className="h-28 rounded-xl bg-gray-100 dark:bg-dark-surface-3 animate-pulse" />
      ))}
    </div>
  );
}

/** Vista reducida para roles sin acceso al summary completo */
function RoleRestrictedView() {
  return (
    <div className="flex flex-col flex-1">
      <PageHeader title="Panel empresarial" subtitle="Vista según tus permisos de acceso" />
      <main className="flex-1 p-6">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center dark:border-dark-border-2 dark:bg-dark-surface-3">
          <Activity className="w-10 h-10 text-gray-400 mx-auto mb-3" aria-hidden="true" />
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
            Panel en preparación
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            El dashboard para tu rol estará disponible próximamente.
          </p>
        </div>
        <div className="mt-6">
          <QuickActionsPanel />
        </div>
      </main>
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
      <div className="flex flex-col flex-1">
        <PageHeader title="Panel empresarial" subtitle="Cargando datos de tu empresa..." />
        <main className="flex-1 p-6 space-y-6">
          <div className="h-40 rounded-xl bg-gray-100 dark:bg-dark-surface-3 animate-pulse" />
          <MetricsSkeleton />
        </main>
      </div>
    );
  }

  // Error de carga
  if (error) {
    return (
      <div className="flex flex-col flex-1">
        <PageHeader title="Panel empresarial" subtitle="Error al cargar el dashboard" />
        <main className="flex-1 p-6">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20">
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-300">{error}</p>
                <button
                  type="button"
                  onClick={() => void loadSummary()}
                  className="text-sm text-red-700 dark:text-red-400 underline mt-2 hover:no-underline"
                >
                  Reintentar
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Sin datos (no debería ocurrir si no hay error, pero manejo defensivo)
  if (!summary) return null;

  return (
    <div className="flex flex-col flex-1">
      <PageHeader
        title={`Bienvenido, ${summary.tenant.name}`}
        subtitle="Panel de administración empresarial"
      />

      <main className="flex-1 p-6 space-y-6">
        {/* Resumen de la empresa */}
        <TenantSummaryCard tenant={summary.tenant} settings={summary.settings} />

        {/* Alertas de onboarding */}
        {summary.alerts.length > 0 && (
          <section aria-label="Alertas de configuración pendiente">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
              Configuración pendiente
            </h2>
            <OnboardingAlerts alerts={summary.alerts} />
          </section>
        )}

        {/* Métricas operativas */}
        <section aria-label="Métricas operativas">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
            Métricas
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              label="Usuarios activos"
              value={summary.metrics.configuredUsers}
              icon={Users}
              emptyLabel="Sin datos"
              description="Usuarios con acceso activo al portal"
            />
            <MetricCard
              label="Eventos de auditoría"
              value={summary.metrics.auditEventsLast7d}
              icon={Activity}
              emptyLabel="Sin datos"
              description="Últimos 7 días"
            />
            <MetricCard
              label="Alertas pendientes"
              value={summary.metrics.pendingAlerts}
              icon={AlertTriangle}
              description="Configuraciones requeridas"
            />
          </div>
        </section>

        {/* Fila inferior: actividad reciente + accesos rápidos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Actividad reciente — solo ADMIN, ya controlado por este componente */}
          <section aria-label="Actividad reciente">
            <RecentActivityPanel />
          </section>

          {/* Accesos rápidos */}
          <section aria-label="Accesos rápidos a módulos">
            <QuickActionsPanel />
          </section>
        </div>
      </main>
    </div>
  );
}
