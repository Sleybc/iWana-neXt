'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { type AccessPermissionKey } from '@iwana/shared';
import { type SettingsSection } from '@/lib/api-client';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/components/auth/AuthProvider';
import { accessControlApi, ApiError, configurationApi } from '@/lib/api-client';
import { SettingsSectionGrid } from './SettingsSectionGrid';
import { PortalAlert, PortalSkeletonBlock } from '@/components/shared/portal-ui';

function mapRegistryError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'Tu rol puede ver la vista base, pero no recibió metadata del shell federado.';
    }

    return error.message;
  }

  return 'No fue posible cargar las secciones federadas del centro de settings.';
}

function mapPermissionsError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'Tu sesión no puede validar permisos efectivos para operar el centro de settings.';
    }

    return error.message;
  }

  return 'No fue posible validar los permisos efectivos del usuario autenticado.';
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <PortalSkeletonBlock className="h-24" />
      <PortalSkeletonBlock className="h-96" />
    </div>
  );
}

export function SettingsClient() {
  const { user, isLoading: authLoading } = useAuth();
  const [sections, setSections] = useState<SettingsSection[]>([]);
  const [effectivePermissions, setEffectivePermissions] = useState<AccessPermissionKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    if (!user) {
      setError('No fue posible resolver la sesión del portal.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [sectionsResult, permissionsResult] = await Promise.allSettled([
        configurationApi.settingsSections.list(),
        accessControlApi.getMyEffectivePermissions(),
      ]);

      if (sectionsResult.status !== 'fulfilled') {
        throw sectionsResult.reason;
      }

      if (permissionsResult.status !== 'fulfilled') {
        throw new Error(mapPermissionsError(permissionsResult.reason));
      }

      setSections(sectionsResult.value);
      setEffectivePermissions(permissionsResult.value.effectivePermissions);
    } catch (loadError) {
      if (loadError instanceof Error && loadError.message) {
        setError(loadError.message);
      } else {
        setError(mapRegistryError(loadError));
      }
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
        <PageHeader
          title="Configuración empresarial"
          subtitle="Cargando secciones federadas de configuración"
        />
        <SettingsSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Configuración empresarial" subtitle="Error al cargar la vista" />
        <PortalAlert
          variant="error"
          title="Vista temporalmente no disponible"
          description={error ?? 'No se pudo cargar la configuración empresarial.'}
          action={
            <button
              type="button"
              onClick={() => void loadSettings()}
              className="text-sm font-medium text-red-700 underline decoration-red-300 underline-offset-4 hover:no-underline dark:text-red-300"
            >
              Reintentar
            </button>
          }
          icon={AlertTriangle}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuración empresarial"
        subtitle="Elige una sección para consultar o administrar la configuración del tenant."
      />

      <SettingsSectionGrid sections={sections} effectivePermissions={effectivePermissions} />
    </div>
  );
}
