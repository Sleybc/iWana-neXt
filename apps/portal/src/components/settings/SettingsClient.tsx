'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Eye } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { OnboardingAlerts } from '@/components/dashboard/OnboardingAlerts';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  ApiError,
  dashboardApi,
  tenantSelfApi,
  type DashboardAlert,
  type TenantSelf,
  type TenantSelfSettings,
} from '@/lib/api-client';
import { BrandingForm } from './BrandingForm';
import { CompanyProfileForm } from './CompanyProfileForm';
import { OperationalSettingsForm } from './OperationalSettingsForm';
import { SecuritySettingsCard } from './SecuritySettingsCard';

function mapError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente.';
    if (error.status === 403) return 'No tienes permisos para consultar esta configuración.';
    return error.message;
  }
  return 'No fue posible cargar la configuración empresarial. Intenta de nuevo.';
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="h-28 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
      <div className="h-80 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
      <div className="h-72 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
      <div className="h-64 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
    </div>
  );
}

export function SettingsClient() {
  const { user, isLoading: authLoading } = useAuth();
  const [profile, setProfile] = useState<TenantSelf | null>(null);
  const [settings, setSettings] = useState<TenantSelfSettings | null>(null);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canEdit = user?.role === 'ADMIN';

  const loadSettings = useCallback(async () => {
    if (!user) {
      setError('No fue posible resolver la sesión del portal.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [profileResult, settingsResult, summaryResult] = await Promise.allSettled([
        tenantSelfApi.getProfile(),
        tenantSelfApi.getSettings(),
        canEdit ? dashboardApi.getSummary() : Promise.resolve(null),
      ]);

      if (profileResult.status !== 'fulfilled') {
        throw profileResult.reason;
      }
      if (settingsResult.status !== 'fulfilled') {
        throw settingsResult.reason;
      }

      setProfile(profileResult.value);
      setSettings(settingsResult.value);

      if (summaryResult.status === 'fulfilled' && summaryResult.value) {
        setAlerts(summaryResult.value.alerts);
      } else {
        setAlerts([]);
      }
    } catch (loadError) {
      setError(mapError(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [canEdit, user]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    void loadSettings();
  }, [authLoading, loadSettings]);

  if (authLoading || isLoading) {
    return (
      <div className="flex flex-1 flex-col">
        <PageHeader
          title="Configuración empresarial"
          subtitle="Cargando perfil empresarial y configuración operativa"
        />
        <main className="flex-1 p-6">
          <SettingsSkeleton />
        </main>
      </div>
    );
  }

  if (error || !profile || !settings) {
    return (
      <div className="flex flex-1 flex-col">
        <PageHeader title="Configuración empresarial" subtitle="Error al cargar la vista" />
        <main className="flex-1 p-6">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-300">
                  {error ?? 'No se pudo cargar la configuración empresarial.'}
                </p>
                <button
                  type="button"
                  onClick={() => void loadSettings()}
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
      <PageHeader
        title="Configuración empresarial"
        subtitle="Administra el perfil, la operación base y la seguridad del tenant autenticado"
      />

      <main className="flex-1 p-6">
        <div className="mx-auto w-full max-w-7xl space-y-6">
          {!canEdit && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
              <div className="flex items-start gap-3">
                <Eye className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
                <div>
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                    Vista solo lectura para tu rol
                  </p>
                  <p className="mt-0.5 text-sm text-blue-700 dark:text-blue-400">
                    Puedes consultar la configuración del tenant, pero las escrituras quedan
                    reservadas al rol ADMIN.
                  </p>
                </div>
              </div>
            </div>
          )}

          {canEdit && alerts.length > 0 && (
            <section aria-label="Alertas de configuración pendiente">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
                Alertas de configuración
              </h2>
              <OnboardingAlerts alerts={alerts} />
            </section>
          )}

          <CompanyProfileForm profile={profile} canEdit={canEdit} onUpdated={setProfile} />

          <OperationalSettingsForm settings={settings} canEdit={canEdit} onUpdated={setSettings} />

          <SecuritySettingsCard settings={settings} canEdit={canEdit} onUpdated={setSettings} />

          <BrandingForm profile={profile} canEdit={canEdit} onUpdated={setProfile} />
        </div>
      </main>
    </div>
  );
}
