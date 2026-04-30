'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
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
import { SettingsOverviewPanel } from './SettingsOverviewPanel';
import { SettingsTabPanel } from './SettingsTabPanel';
import { SettingsTabs } from './SettingsTabs';
import { SETTINGS_NAVIGATION, type SettingsTabId } from './settings-navigation';

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
      <div className="h-32 animate-pulse rounded-[24px] bg-gray-100 shadow-iwana-soft dark:bg-dark-surface-3" />
      <div className="h-20 animate-pulse rounded-[24px] bg-gray-100 shadow-iwana-soft dark:bg-dark-surface-3" />
      <div className="h-80 animate-pulse rounded-[24px] bg-gray-100 shadow-iwana-soft dark:bg-dark-surface-3" />
      <div className="h-72 animate-pulse rounded-[24px] bg-gray-100 shadow-iwana-soft dark:bg-dark-surface-3" />
    </div>
  );
}

export function SettingsClient() {
  const { user, isLoading: authLoading } = useAuth();
  const tabNamespace = useId();
  const [profile, setProfile] = useState<TenantSelf | null>(null);
  const [settings, setSettings] = useState<TenantSelfSettings | null>(null);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [activeTab, setActiveTab] = useState<SettingsTabId>('general');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canEdit = user?.role === 'ADMIN';

  const tabBadgeMap = useMemo(() => {
    return {
      general: null,
      operations: null,
      security: !settings?.features.mfa_required_all
        ? { label: 'Atención', variant: 'warning' as const }
        : null,
      branding: !canEdit ? { label: 'Solo lectura', variant: 'info' as const } : null,
    };
  }, [canEdit, settings?.features.mfa_required_all]);

  const getTabId = useCallback(
    (tabId: SettingsTabId) => `${tabNamespace}-${tabId}-tab`,
    [tabNamespace],
  );

  const getPanelId = useCallback(
    (tabId: SettingsTabId) => `${tabNamespace}-${tabId}-panel`,
    [tabNamespace],
  );

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
          <div className="rounded-[24px] border border-red-200/80 bg-[linear-gradient(135deg,rgba(254,242,242,0.98),rgba(254,226,226,0.82))] p-6 shadow-iwana-soft dark:border-red-800 dark:bg-red-900/20">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                <AlertTriangle className="h-5 w-5 shrink-0" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-700 dark:text-red-300">
                  Vista temporalmente no disponible
                </p>
                <p className="text-sm font-medium text-red-800 dark:text-red-300">
                  {error ?? 'No se pudo cargar la configuración empresarial.'}
                </p>
                <p className="mt-1 text-sm text-red-700/80 dark:text-red-200/80">
                  Reintenta para recuperar el perfil empresarial, sus parámetros operativos y la
                  política base de seguridad.
                </p>
                <button
                  type="button"
                  onClick={() => void loadSettings()}
                  className="mt-2 text-sm font-medium text-red-700 underline decoration-red-300 underline-offset-4 hover:no-underline dark:text-red-400"
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
        subtitle="Administra el perfil, la operación base y la seguridad de la empresa autenticada"
      />

      <main className="flex-1 p-6">
        <div className="w-full space-y-6">
          <div className="rounded-[24px] border border-white/70 bg-[linear-gradient(135deg,rgba(248,250,245,0.96),rgba(255,255,255,0.92))] px-5 py-4 shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-2/90">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
              Centro de control
            </p>
            <p className="mt-1 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
              Aquí se consolidan perfil empresarial, parámetros operativos, seguridad base y marca
              de la empresa autenticada.
            </p>
          </div>

          <SettingsOverviewPanel
            profile={profile}
            settings={settings}
            alerts={alerts}
            canEdit={canEdit}
          />

          <SettingsTabs
            items={SETTINGS_NAVIGATION}
            activeTab={activeTab}
            onChange={setActiveTab}
            getTabId={getTabId}
            getPanelId={getPanelId}
            getBadge={(tabId) => tabBadgeMap[tabId]}
          />

          <div className="space-y-6">
            <SettingsTabPanel
              id={getPanelId('general')}
              labelledBy={getTabId('general')}
              isActive={activeTab === 'general'}
            >
              <CompanyProfileForm profile={profile} canEdit={canEdit} onUpdated={setProfile} />
            </SettingsTabPanel>

            <SettingsTabPanel
              id={getPanelId('operations')}
              labelledBy={getTabId('operations')}
              isActive={activeTab === 'operations'}
            >
              <OperationalSettingsForm
                settings={settings}
                canEdit={canEdit}
                onUpdated={setSettings}
              />
            </SettingsTabPanel>

            <SettingsTabPanel
              id={getPanelId('security')}
              labelledBy={getTabId('security')}
              isActive={activeTab === 'security'}
            >
              <SecuritySettingsCard settings={settings} canEdit={canEdit} onUpdated={setSettings} />
            </SettingsTabPanel>

            <SettingsTabPanel
              id={getPanelId('branding')}
              labelledBy={getTabId('branding')}
              isActive={activeTab === 'branding'}
            >
              <BrandingForm profile={profile} canEdit={canEdit} onUpdated={setProfile} />
            </SettingsTabPanel>
          </div>
        </div>
      </main>
    </div>
  );
}
