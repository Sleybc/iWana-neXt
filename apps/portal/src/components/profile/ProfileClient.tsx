'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { OnboardingAlerts } from '@/components/dashboard/OnboardingAlerts';
import { useAuth } from '@/components/auth/AuthProvider';
import { userApi, dashboardApi, type UserProfile, type DashboardAlert } from '@/lib/api-client';
import { ChangePasswordForm } from './ChangePasswordForm';
import { MfaRequiredToggle } from './MfaRequiredToggle';
import { PersonalInfoForm } from './PersonalInfoForm';
import { ProfileHeader } from './ProfileHeader';

function roleToLabel(role: string): string {
  const labels: Record<string, string> = {
    ADMIN: 'Administrador',
    NOC: 'Operador NOC',
    ACCOUNTANT: 'Contabilidad',
    SUPPORT: 'Soporte',
    SALES: 'Ventas',
    TECHNICIAN: 'Técnico',
    HR: 'Recursos Humanos',
    AUDITOR: 'Auditor',
    SUBSCRIBER: 'Suscriptor',
  };
  return labels[role] ?? role;
}

/**
 * Orquesta la vista de perfil del usuario autenticado.
 * Incluye: header Gravatar, alertas de empresa, datos personales y cambio de contraseña.
 */
export function ProfileClient() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [mfaRequiredAll, setMfaRequiredAll] = useState(false);
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
      // Carga perfil y alertas en paralelo — alertas solo para ADMIN
      const [profileData, summaryData] = await Promise.allSettled([
        userApi.getMe(user.id),
        user.role === 'ADMIN' ? dashboardApi.getSummary() : Promise.resolve(null),
      ]);

      if (profileData.status === 'fulfilled') {
        setProfile(profileData.value);
      } else {
        throw new Error('No fue posible cargar tu perfil.');
      }

      if (summaryData.status === 'fulfilled' && summaryData.value) {
        setAlerts(summaryData.value.alerts);
        setMfaRequiredAll(summaryData.value.settings.features.mfa_required_all);
        setTenantCountry(summaryData.value.settings.country);
      }
    } catch {
      setError('No fue posible cargar tu perfil. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, user?.role]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col">
        <PageHeader title="Mi perfil" subtitle="Cargando tu información..." />
        <main className="flex-1 p-6">
          <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)] lg:items-start">
            <div className="space-y-6 lg:col-span-2">
              <div className="h-36 animate-pulse rounded-xl bg-gray-100 dark:bg-dark-surface-3" />
            </div>
            <div className="space-y-6">
              <div className="h-72 animate-pulse rounded-xl bg-gray-100 dark:bg-dark-surface-3" />
            </div>
            <div className="space-y-6">
              <div className="h-56 animate-pulse rounded-xl bg-gray-100 dark:bg-dark-surface-3" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error || !profile || !user) {
    return (
      <div className="flex flex-1 flex-col">
        <PageHeader title="Mi perfil" subtitle="Error al cargar" />
        <main className="flex-1 p-6">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-300">
                  {error ?? 'No se pudo cargar el perfil.'}
                </p>
                <button
                  type="button"
                  onClick={() => void loadProfile()}
                  className="mt-2 text-sm text-red-700 underline hover:no-underline dark:text-red-400"
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

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="Mi perfil" subtitle="Gestiona tu información personal y seguridad" />

      <main className="flex-1 p-6">
        <div className="mx-auto w-full max-w-7xl space-y-6">
          {/* Header con avatar Gravatar, nombre, rol y estado — ancho completo */}
          <ProfileHeader profile={profile} roleLabel={roleToLabel(user.role)} />

          {/* Contenido principal — dos columnas en pantallas grandes */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)] lg:items-start">
            <div className="space-y-6">
              {/* Datos personales */}
              <PersonalInfoForm
                profile={profile}
                userId={user.id}
                {...(tenantCountry !== undefined ? { tenantCountry } : {})}
                onUpdated={(updated) => setProfile(updated)}
              />
            </div>

            <div className="space-y-6">
              {/* Alertas de configuración de empresa — solo si hay alertas activas */}
              {alerts.length > 0 && (
                <section aria-label="Alertas de configuración pendiente">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
                    Configuración pendiente
                  </h2>
                  <OnboardingAlerts alerts={alerts} />
                </section>
              )}

              {/* Configuración de MFA obligatorio — solo ADMIN */}
              {user.role === 'ADMIN' && (
                <MfaRequiredToggle
                  mfaRequiredAll={mfaRequiredAll}
                  onUpdated={(val) => {
                    setMfaRequiredAll(val);
                    // Actualizar alertas: si MFA ya está activo, eliminar la alerta de MFA
                    if (val) {
                      setAlerts((prev) => prev.filter((a) => a.id !== 'mfa-not-required'));
                    }
                  }}
                />
              )}

              {/* Cambio de contraseña */}
              <ChangePasswordForm />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
