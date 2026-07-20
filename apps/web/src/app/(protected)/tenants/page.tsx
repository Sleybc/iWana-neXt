'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@iwana/ui';
import { Building2, CircleCheckBig, Clock3, ShieldAlert, X } from 'lucide-react';
import { TenantsTable } from '@/components/dashboard/TenantsTable';
import { PageHeader } from '@/components/layout/PageHeader';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { tenantApi, type TenantListItem } from '@/lib/api-client';
import { mergeUrlSearchParams, withSearchParams } from '@/lib/merge-url-search-params';

type TenantConfirmAction = {
  type: 'suspend' | 'activate';
  id: string;
};

type TenantStatusFilter =
  | 'TODAS'
  | 'ACTIVE'
  | 'PROVISIONING'
  | 'PROVISIONING_FAILED'
  | 'SUSPENDED'
  | 'INACTIVE'
  | 'MARKED_FOR_DELETION';

const VALID_STATUS_FILTERS = new Set<TenantStatusFilter>([
  'TODAS',
  'ACTIVE',
  'PROVISIONING',
  'PROVISIONING_FAILED',
  'SUSPENDED',
  'INACTIVE',
  'MARKED_FOR_DELETION',
]);

function parseStatusFilter(value: string | null): TenantStatusFilter {
  if (!value) return 'TODAS';
  return VALID_STATUS_FILTERS.has(value as TenantStatusFilter)
    ? (value as TenantStatusFilter)
    : 'TODAS';
}

export default function TenantsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search')?.trim() ?? '');
  const [statusFilter, setStatusFilter] = useState<TenantStatusFilter>(() =>
    parseStatusFilter(searchParams.get('status')),
  );
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<TenantConfirmAction | null>(null);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);
  const successDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persistencia URL: search + status
  useEffect(() => {
    const query = mergeUrlSearchParams(searchParams, {
      search: searchQuery.trim() || null,
      status: statusFilter === 'TODAS' ? null : statusFilter,
    });
    const current = searchParams.toString();
    if (query === current) {
      return;
    }
    router.replace(withSearchParams(pathname, query), { scroll: false });
  }, [pathname, router, searchParams, searchQuery, statusFilter]);

  const clearSuccessDismissTimer = useCallback(() => {
    if (successDismissTimerRef.current) {
      clearTimeout(successDismissTimerRef.current);
      successDismissTimerRef.current = null;
    }
  }, []);

  const showNotification = useCallback(
    (type: 'success' | 'error', message: string) => {
      clearSuccessDismissTimer();
      setNotification({ type, message });
      // Éxito: autodescarte; error: persiste hasta cierre manual.
      if (type === 'success') {
        successDismissTimerRef.current = setTimeout(() => {
          setNotification(null);
          successDismissTimerRef.current = null;
        }, 3000);
      }
    },
    [clearSuccessDismissTimer],
  );

  useEffect(() => {
    return () => {
      clearSuccessDismissTimer();
    };
  }, [clearSuccessDismissTimer]);

  const upsertTenantInState = useCallback((tenant: TenantListItem) => {
    setTenants((current) =>
      current.map((item) => (item.id === tenant.id ? { ...item, ...tenant } : item)),
    );
  }, []);

  const loadTenants = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await tenantApi.list({ limit: 100, offset: 0 });
      setTenants(response);
    } catch {
      setError('No fue posible cargar empresas.');
      setTenants([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  const executeSuspend = useCallback(
    async (id: string) => {
      try {
        await tenantApi.suspend(id);
        await loadTenants();
        showNotification('success', 'Empresa suspendida correctamente');
      } catch (err) {
        console.error('Error suspending tenant:', err);
        showNotification('error', 'Error al suspender la empresa');
      }
    },
    [loadTenants, showNotification],
  );

  const executeActivate = useCallback(
    async (id: string) => {
      try {
        await tenantApi.activate(id);
        await loadTenants();
        showNotification('success', 'Empresa reactivada correctamente');
      } catch (err) {
        console.error('Error activating tenant:', err);
        showNotification('error', 'Error al reactivar la empresa');
      }
    },
    [loadTenants, showNotification],
  );

  const handleSuspend = useCallback((id: string) => {
    setPendingConfirm({ type: 'suspend', id });
  }, []);

  const handleActivate = useCallback((id: string) => {
    setPendingConfirm({ type: 'activate', id });
  }, []);

  const handleConfirmPending = useCallback(async () => {
    if (!pendingConfirm) {
      return;
    }

    setIsConfirmingAction(true);
    try {
      if (pendingConfirm.type === 'suspend') {
        await executeSuspend(pendingConfirm.id);
      } else {
        await executeActivate(pendingConfirm.id);
      }
    } finally {
      setIsConfirmingAction(false);
      setPendingConfirm(null);
    }
  }, [executeActivate, executeSuspend, pendingConfirm]);

  const handleRetryProvisioning = useCallback(
    async (id: string) => {
      try {
        setTenants((current) =>
          current.map((tenant) =>
            tenant.id === id
              ? {
                  ...tenant,
                  status: 'PROVISIONING',
                  updatedAt: new Date().toISOString(),
                }
              : tenant,
          ),
        );

        const retriedTenant = await tenantApi.retryProvisioning(id);
        upsertTenantInState(retriedTenant);

        const resolvedTenant = await tenantApi.waitForProvisioning(id, {
          maxAttempts: 10,
          onTick: upsertTenantInState,
        });

        upsertTenantInState(resolvedTenant);

        if (resolvedTenant.status === 'ACTIVE') {
          showNotification('success', 'Configuración completada correctamente');
          return;
        }

        if (resolvedTenant.status === 'PROVISIONING_FAILED') {
          showNotification(
            'error',
            'La configuración volvió a fallar. Revisa el estado y reintenta en unos minutos.',
          );
          return;
        }

        showNotification('success', 'Configuración reintentada correctamente');
      } catch (err) {
        console.error('Error retrying provisioning:', err);
        await loadTenants();
        showNotification('error', 'Error al reintentar la configuración');
      }
    },
    [loadTenants, showNotification, upsertTenantInState],
  );

  const summaryCards = useMemo(() => {
    const active = tenants.filter((tenant) => tenant.status === 'ACTIVE').length;
    const provisioning = tenants.filter((tenant) => tenant.status === 'PROVISIONING').length;
    const attention = tenants.filter((tenant) =>
      ['PROVISIONING_FAILED', 'SUSPENDED', 'INACTIVE', 'MARKED_FOR_DELETION'].includes(
        tenant.status,
      ),
    ).length;

    return [
      {
        label: 'Activas',
        value: active,
        detail: 'Operando con acceso disponible',
        icon: CircleCheckBig,
        tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/25 dark:text-emerald-300',
      },
      {
        label: 'En puesta en marcha',
        value: provisioning,
        detail: 'Configuraciones todavía en curso',
        icon: Clock3,
        tone: 'bg-amber-50 text-amber-700 dark:bg-amber-950/25 dark:text-amber-300',
      },
      {
        label: 'Requieren atención',
        value: attention,
        detail: 'Suspendidas, inactivas o con error',
        icon: ShieldAlert,
        tone: 'bg-red-50 text-red-700 dark:bg-red-950/25 dark:text-red-300',
      },
      {
        label: 'Directorio total',
        value: tenants.length,
        detail: 'Empresas registradas en plataforma',
        icon: Building2,
        tone: 'bg-iwana-surface-soft text-iwana-primary dark:bg-dark-surface-3 dark:text-white',
      },
    ] as const;
  }, [tenants]);

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

  const pendingTenantName =
    pendingConfirm != null
      ? (tenants.find((tenant) => tenant.id === pendingConfirm.id)?.name ?? 'esta empresa')
      : '';

  return (
    <div className="space-y-6">
      {notification && (
        <div
          role={notification.type === 'error' ? 'alert' : 'status'}
          {...(notification.type === 'success' ? { 'aria-live': 'polite' as const } : {})}
          className={`fixed top-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-2xl px-4 py-3 shadow-lg ${
            notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          <p className="flex-1 text-sm leading-5 font-medium">{notification.message}</p>
          <button
            type="button"
            onClick={() => {
              clearSuccessDismissTimer();
              setNotification(null);
            }}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white/90 transition hover:bg-white/15 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            aria-label="Cerrar notificación"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <ConfirmDialog
        open={pendingConfirm?.type === 'suspend'}
        title="Suspender empresa"
        description={
          <>
            Se suspenderá <strong>{pendingTenantName}</strong>. Los usuarios de esa empresa no
            podrán acceder hasta que se reactive.
          </>
        }
        confirmLabel="Sí, suspender"
        isConfirming={isConfirmingAction}
        onConfirm={() => {
          void handleConfirmPending();
        }}
        onCancel={() => setPendingConfirm(null)}
      />

      <ConfirmDialog
        open={pendingConfirm?.type === 'activate'}
        title="Reactivar empresa"
        description={
          <>
            Se reactivará <strong>{pendingTenantName}</strong> y sus usuarios recuperarán el acceso
            según su estado individual.
          </>
        }
        confirmLabel="Sí, reactivar"
        isConfirming={isConfirmingAction}
        onConfirm={() => {
          void handleConfirmPending();
        }}
        onCancel={() => setPendingConfirm(null)}
      />

      <PageHeader
        title="Empresas"
        subtitle="Revisa la puesta en marcha, el estado operativo y los datos base de cada empresa desde un solo directorio."
        actions={
          <Button asChild variant="lime">
            <Link href="/tenants/new">Nueva empresa</Link>
          </Button>
        }
      />

      <section
        aria-label="Resumen operativo del directorio"
        className="rounded-2xl border border-gray-200 bg-iwana-surface-soft/70 p-5 shadow-sm dark:border-dark-border dark:bg-dark-surface-2"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="portal-eyebrow">Directorio operativo</p>
            <h2 className="mt-2 text-xl font-semibold text-iwana-primary dark:text-white">
              Prioriza altas pendientes, revisa alertas y entra rápido a la configuración de cada
              empresa.
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
              El directorio te muestra el estado actual, el contacto principal y la última
              actualización disponible para tomar decisiones sin salir de esta vista.
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/dashboard">Volver al centro de control</Link>
          </Button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;

            return (
              <div
                key={card.label}
                className="rounded-2xl border border-white/80 bg-white px-4 py-4 shadow-sm dark:border-dark-border dark:bg-dark-surface-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      {card.label}
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-iwana-primary dark:text-white">
                      {isLoading ? '...' : card.value}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                      {card.detail}
                    </p>
                  </div>
                  <div className={`rounded-2xl p-2.5 ${card.tone}`}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <TenantsTable
        tenants={tableRows}
        isLoading={isLoading}
        error={error}
        onRetry={loadTenants}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onSuspend={handleSuspend}
        onActivate={handleActivate}
        onRetryProvisioning={handleRetryProvisioning}
      />
    </div>
  );
}
