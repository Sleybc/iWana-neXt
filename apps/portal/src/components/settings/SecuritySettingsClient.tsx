'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { UserRole } from '@iwana/shared';
import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { ApiError, tenantSelfApi, type TenantSelfSettings } from '@/lib/api-client';
import { PortalAlert, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { SECURITY_SETTINGS_COPY } from './mod00-settings-labels';
import { SecuritySettingsCard } from './SecuritySettingsCard';

function mapSecurityError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente.';
    if (error.status === 403) return 'No tienes permisos para consultar seguridad.';
    return error.message;
  }

  return SECURITY_SETTINGS_COPY.unavailableMessage;
}

export function SecuritySettingsClient() {
  const { user, isLoading: authLoading } = useAuth();
  const [settings, setSettings] = useState<TenantSelfSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      setError('No fue posible resolver la sesión del portal.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      setSettings(await tenantSelfApi.getSettings());
    } catch (loadError) {
      setError(mapSecurityError(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    void loadSettings();
  }, [authLoading, loadSettings]);

  if (authLoading || isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Seguridad" subtitle={SECURITY_SETTINGS_COPY.loadingSubtitle} />
        <PortalSkeletonBlock className="h-72" />
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="space-y-6">
        <PageHeader title="Seguridad" subtitle="Error al cargar la vista" />
        <PortalAlert
          variant="error"
          title="Vista temporalmente no disponible"
          description={error ?? 'No se pudo cargar la política de seguridad.'}
          icon={AlertTriangle}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Seguridad" subtitle={SECURITY_SETTINGS_COPY.pageSubtitle} />
      <SecuritySettingsCard
        settings={settings}
        canEdit={user?.role === UserRole.ADMIN}
        onUpdated={setSettings}
      />
    </div>
  );
}
