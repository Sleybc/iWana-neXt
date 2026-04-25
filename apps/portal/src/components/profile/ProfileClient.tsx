'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
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
        <PageHeader
          title="Mi perfil"
          subtitle="Estamos preparando tu perfil y los controles de seguridad."
        />
        <main className="flex-1 p-6">
          <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)] lg:items-start">
            <div className="space-y-6 lg:col-span-2">
              <div className="h-40 animate-pulse rounded-[28px] border border-white/70 bg-white/80 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2" />
            </div>
            <div className="space-y-6">
              <div className="h-80 animate-pulse rounded-[28px] border border-white/70 bg-white/80 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2" />
            </div>
            <div className="space-y-6">
              <div className="h-64 animate-pulse rounded-[28px] border border-white/70 bg-white/80 shadow-iwana-card dark:border-dark-border dark:bg-dark-surface-2" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error || !profile || !user) {
    return (
      <div className="flex flex-1 flex-col">
        <PageHeader title="Mi perfil" subtitle="No pudimos consolidar tu vista personal" />
        <main className="flex-1 p-6">
          <div className="rounded-[28px] border border-red-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(254,242,242,0.96))] p-6 shadow-iwana-card dark:border-red-900/70 dark:bg-[linear-gradient(135deg,rgba(69,10,10,0.5),rgba(24,24,27,0.96))]">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-300">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-600/80 dark:text-red-300">
                    Perfil no disponible
                  </p>
                  <p className="text-sm font-medium text-red-800 dark:text-red-100">
                    {error ?? 'No se pudo cargar el perfil.'}
                  </p>
                  <p className="text-sm text-red-700/80 dark:text-red-200/80">
                    Reintenta para recuperar tus datos personales y la configuración de seguridad.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadProfile()}
                  className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-50 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/70"
                >
                  <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                  Reintentar carga
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
        <div className="w-full space-y-6">
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
