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
import { PortalAlert, PortalSkeletonBlock } from '@/components/shared/portal-ui';

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
      <PortalSkeletonBlock className="h-32" />
      <PortalSkeletonBlock className="h-20" />
      <PortalSkeletonBlock className="h-80" />
      <PortalSkeletonBlock className="h-72" />
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
      <div className="space-y-6">
        <PageHeader
          title="Configuración empresarial"
          subtitle="Cargando perfil empresarial y configuración operativa"
        />
        <SettingsSkeleton />
      </div>
    );
  }

  if (error || !profile || !settings) {
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
        subtitle="Administra perfil, operación base, seguridad y marca."
      />

      <div className="w-full space-y-6">
        <SettingsTabs
          items={SETTINGS_NAVIGATION}
          activeTab={activeTab}
          onChange={setActiveTab}
          getTabId={getTabId}
          getPanelId={getPanelId}
          getBadge={(tabId) => tabBadgeMap[tabId]}
        />

        <SettingsOverviewPanel
          profile={profile}
          settings={settings}
          alerts={alerts}
          canEdit={canEdit}
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
    </div>
  );
}
