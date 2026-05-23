'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { UserRole } from '@iwana/shared';
import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { ApiError, tenantSelfApi, type TenantSelf } from '@/lib/api-client';
import { PortalAlert, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { BrandingForm } from './BrandingForm';

function mapBrandingError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente.';
    if (error.status === 403) return 'No tienes permisos para consultar marca.';
    return error.message;
  }

  return 'No fue posible cargar la configuración de marca.';
}

export function BrandingSettingsClient() {
  const { user, isLoading: authLoading } = useAuth();
  const [profile, setProfile] = useState<TenantSelf | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      setError('No fue posible resolver la sesión del portal.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      setProfile(await tenantSelfApi.getProfile());
    } catch (loadError) {
      setError(mapBrandingError(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    void loadProfile();
  }, [authLoading, loadProfile]);

  if (authLoading || isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Marca" subtitle="Cargando identidad visual del tenant" />
        <PortalSkeletonBlock className="h-96" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="space-y-6">
        <PageHeader title="Marca" subtitle="Error al cargar la vista" />
        <PortalAlert
          variant="error"
          title="Vista temporalmente no disponible"
          description={error ?? 'No se pudo cargar la identidad visual.'}
          icon={AlertTriangle}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marca"
        subtitle="Administra identidad visual, activos y metadata pública del portal empresarial."
      />
      <BrandingForm
        profile={profile}
        canEdit={user?.role === UserRole.ADMIN}
        onUpdated={setProfile}
      />
    </div>
  );
}
