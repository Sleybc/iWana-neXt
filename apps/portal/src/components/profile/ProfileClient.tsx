'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { OnboardingAlerts } from '@/components/dashboard/OnboardingAlerts';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  ApiError,
  userApi,
  dashboardApi,
  type UserProfile,
  type DashboardAlert,
} from '@/lib/api-client';
import { getPortalUserRoleLabel } from '@/lib/user-labels';
import { ChangePasswordForm } from './ChangePasswordForm';
import { PersonalInfoForm } from './PersonalInfoForm';
import { ProfileHeader } from './ProfileHeader';
import { PortalAlert, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { Button } from '@iwana/ui';

/**
 * Orquesta la vista de perfil del usuario autenticado.
 * Incluye: encabezado del perfil, alertas de empresa, datos personales y cambio de contraseña.
 */
export function ProfileClient() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [tenantCountry, setTenantCountry] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Carga perfil y alertas en paralelo — alertas solo para ADMIN.
      // /users/me se resuelve por el sub del JWT: no transporta identidad (P-01).
      const [profileData, summaryData] = await Promise.allSettled([
        userApi.getMe(),
        user.role === 'ADMIN' ? dashboardApi.getSummary() : Promise.resolve(null),
      ]);

      if (profileData.status === 'rejected') {
        throw profileData.reason;
      }
      setProfile(profileData.value);

      if (summaryData.status === 'fulfilled' && summaryData.value) {
        setAlerts(summaryData.value.alerts);
        setTenantCountry(summaryData.value.settings.country);
      }
    } catch (error) {
      // Un 401 tras el reintento de refresh es condición de sesión expirada,
      // no un fallo de carga del perfil: se informa como tal (P-15).
      if (error instanceof ApiError && error.status === 401) {
        setError('Tu sesión expiró. Inicia sesión de nuevo.');
      } else {
        setError('No fue posible cargar tu perfil. Intenta de nuevo.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, user?.role]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Mi perfil"
          subtitle="Estamos preparando tus datos personales y tus credenciales de acceso."
        />
        <PortalSkeletonBlock className="h-28" />
        <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)] lg:items-start">
          <div className="space-y-6">
            <PortalSkeletonBlock className="h-80" />
          </div>
          <div className="space-y-6">
            <PortalSkeletonBlock className="h-64" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !profile || !user) {
    return (
      <div className="space-y-6">
        <PageHeader title="Mi perfil" subtitle="No pudimos consolidar tu vista personal" />
        <PortalAlert
          variant="error"
          title="Perfil no disponible"
          description={error ?? 'No se pudo cargar el perfil.'}
          action={
            <Button type="button" variant="softDestructive" onClick={() => void loadProfile()}>
              <RefreshCcw className="h-4 w-4" aria-hidden="true" />
              Reintentar carga
            </Button>
          }
          icon={AlertTriangle}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mi perfil"
        subtitle="Gestiona tu información personal y tus credenciales de acceso"
      />
      <div className="w-full space-y-6">
        <ProfileHeader profile={profile} roleLabel={getPortalUserRoleLabel(user.role)} />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)] lg:items-start">
          <div className="space-y-6">
            <PersonalInfoForm
              profile={profile}
              userId={user.id}
              {...(tenantCountry !== undefined ? { tenantCountry } : {})}
              onUpdated={(updated) => setProfile(updated)}
            />
          </div>

          <div className="space-y-6">
            {alerts.length > 0 && (
              <section aria-label="Alertas de configuración pendiente">
                <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
                  Configuración pendiente
                </p>
                <OnboardingAlerts alerts={alerts} />
              </section>
            )}

            <ChangePasswordForm />
          </div>
        </div>
      </div>
    </div>
  );
}
