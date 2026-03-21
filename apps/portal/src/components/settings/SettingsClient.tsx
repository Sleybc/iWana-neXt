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
  type DashboardSummary,
  type TenantSelf,
  type TenantSelfSettings,
} from '@/lib/api-client';
import { BrandingForm } from './BrandingForm';
import { CommercialCoverageCard } from './CommercialCoverageCard';
import { CompanyProfileForm } from './CompanyProfileForm';
import { OperationalSettingsForm } from './OperationalSettingsForm';
import { PlanCatalogCard } from './PlanCatalogCard';
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
      <div className="h-28 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
      <div className="h-80 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
      <div className="h-72 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
      <div className="h-64 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
    </div>
  );
}

export function SettingsClient() {
  const { user, isLoading: authLoading } = useAuth();
  const tabNamespace = useId();
  const [profile, setProfile] = useState<TenantSelf | null>(null);
  const [settings, setSettings] = useState<TenantSelfSettings | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [activeTab, setActiveTab] = useState<SettingsTabId>('general');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canEdit = user?.role === 'ADMIN';

  const tabBadgeMap = useMemo(() => {
    return {
      general: null,
      operations: null,
      commercial: null,
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
        setSummary(summaryResult.value);
        setAlerts(summaryResult.value.alerts);
      } else {
        setSummary(null);
        setAlerts([]);
      }
    } catch (loadError) {
      setSummary(null);
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
              id={getPanelId('commercial')}
              labelledBy={getTabId('commercial')}
              isActive={activeTab === 'commercial'}
            >
              <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                <CommercialCoverageCard canEdit={canEdit} />
                <PlanCatalogCard canEdit={canEdit} />
              </div>
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
