'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { SettingsSectionKey, type AccessPermissionKey } from '@iwana/shared';
import { type SettingsSection } from '@/lib/api-client';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/components/auth/AuthProvider';
import { accessControlApi, ApiError, configurationApi } from '@/lib/api-client';
import { SETTINGS_HUB_COPY } from './mod00-settings-labels';
import { SettingsSectionGrid } from './SettingsSectionGrid';
import {
  PortalAlert,
  PortalPanel,
  PortalSkeletonBlock,
  interactiveFocusClassName,
} from '@/components/shared/portal-ui';

function mapRegistryError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return SETTINGS_HUB_COPY.registryForbidden;
    }

    return error.message;
  }

  return SETTINGS_HUB_COPY.registryUnavailable;
}

function mapPermissionsError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return SETTINGS_HUB_COPY.permissionsForbidden;
    }

    return error.message;
  }

  return SETTINGS_HUB_COPY.permissionsUnavailable;
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

  const prioritySection = sections.find(
    (section) => section.key === SettingsSectionKey.ACCESS && section.route,
  );

  const loadSettings = useCallback(async () => {
    if (!user) {
      setError(SETTINGS_HUB_COPY.sessionUnavailable);
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
          title={SETTINGS_HUB_COPY.pageTitle}
          subtitle={SETTINGS_HUB_COPY.loadingSubtitle}
        />
        <SettingsSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={SETTINGS_HUB_COPY.pageTitle}
          subtitle={SETTINGS_HUB_COPY.errorSubtitle}
        />
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
              {SETTINGS_HUB_COPY.retryAction}
            </button>
          }
          icon={AlertTriangle}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={SETTINGS_HUB_COPY.pageTitle} subtitle={SETTINGS_HUB_COPY.pageSubtitle} />

      {prioritySection ? (
        <PortalPanel
          eyebrow={SETTINGS_HUB_COPY.priorityEyebrow}
          title={SETTINGS_HUB_COPY.priorityTitle}
          description={SETTINGS_HUB_COPY.priorityDescription}
          className="border-iwana-primary/15 bg-iwana-surface-soft"
          actions={
            <Link
              href={prioritySection.route ?? '/dashboard/settings/access'}
              className={`${interactiveFocusClassName} inline-flex items-center justify-center rounded-full bg-iwana-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-iwana-primary-800`}
            >
              {SETTINGS_HUB_COPY.priorityAction}
            </Link>
          }
        >
          <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
            Prioriza esta revisión para reforzar la seguridad y el gobierno de acceso de la empresa.
          </p>
        </PortalPanel>
      ) : null}

      <SettingsSectionGrid sections={sections} effectivePermissions={effectivePermissions} />
    </div>
  );
}
