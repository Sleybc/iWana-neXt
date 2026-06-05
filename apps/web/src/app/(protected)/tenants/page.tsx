'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@iwana/ui';
import { TenantsTable } from '@/components/dashboard/TenantsTable';
import { PageHeader } from '@/components/layout/PageHeader';
import { tenantApi, type TenantListItem } from '@/lib/api-client';

export default function TenantsPage() {
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showNotification = useCallback((type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
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

  const handleSuspend = useCallback(
    async (id: string) => {
      if (
        !confirm(
          '¿Está seguro de que desea suspender esta empresa? Los usuarios no podrán acceder.',
        )
      )
        return;

      setActionInProgress(id);
      try {
        await tenantApi.suspend(id);
        await loadTenants();
        showNotification('success', 'Empresa suspendida correctamente');
      } catch (err) {
        console.error('Error suspending tenant:', err);
        showNotification('error', 'Error al suspender la empresa');
      } finally {
        setActionInProgress(null);
      }
    },
    [loadTenants, showNotification],
  );

  const handleActivate = useCallback(
    async (id: string) => {
      setActionInProgress(id);
      try {
        await tenantApi.activate(id);
        await loadTenants();
        showNotification('success', 'Empresa reactivada correctamente');
      } catch (err) {
        console.error('Error activating tenant:', err);
        showNotification('error', 'Error al reactivar la empresa');
      } finally {
        setActionInProgress(null);
      }
    },
    [loadTenants, showNotification],
  );

  const handleRetryProvisioning = useCallback(
    async (id: string) => {
      setActionInProgress(id);
      try {
        await tenantApi.retryProvisioning(id);
        await loadTenants();
        showNotification('success', 'Configuración reintentada correctamente');
      } catch (err) {
        console.error('Error retrying provisioning:', err);
        showNotification('error', 'Error al reintentar la configuración');
      } finally {
        setActionInProgress(null);
      }
    },
    [loadTenants, showNotification],
  );

  const tableRows = useMemo(
    () =>
      tenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        createdAt: tenant.createdAt,
      })),
    [tenants],
  );

  return (
    <div className="space-y-6">
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg ${
            notification.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {notification.message}
        </div>
      )}

      <PageHeader
        title="Empresas"
        subtitle="Administración de empresas del sistema"
        actions={
          <Button asChild>
            <Link href="/tenants/new">Nueva empresa</Link>
          </Button>
        }
      />

      <TenantsTable
        tenants={tableRows}
        isLoading={isLoading}
        error={error}
        onRetry={loadTenants}
        onSuspend={handleSuspend}
        onActivate={handleActivate}
        onRetryProvisioning={handleRetryProvisioning}
      />
    </div>
  );
}
