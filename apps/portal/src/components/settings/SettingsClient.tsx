'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { type AccessPermissionKey, type SettingsPriorityResponse } from '@iwana/shared';
import { Button } from '@iwana/ui';
import type { SettingsSection } from '@/lib/api-client';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/components/auth/AuthProvider';
import { accessControlApi, ApiError, configurationApi } from '@/lib/api-client';
import { SETTINGS_HUB_COPY } from './mod00-settings-labels';
import { SettingsSectionGrid } from './SettingsSectionGrid';
import { PortalAlert, PortalPanel, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { getSettingsPriorityPresentation, isSettingsPriorityOperable } from './settings-priority';

function mapRegistryError(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return SETTINGS_HUB_COPY.registryForbidden;
  }

  return SETTINGS_HUB_COPY.registryUnavailable;
}

function mapPermissionsError(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return SETTINGS_HUB_COPY.permissionsForbidden;
  }

  return SETTINGS_HUB_COPY.permissionsUnavailable;
}

function SettingsSkeleton() {
  return (
    <>
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label={SETTINGS_HUB_COPY.loadingSubtitle}
        className="sr-only"
      />
      <div className="space-y-6" aria-busy="true">
        <PortalSkeletonBlock className="h-24" />
        <PortalSkeletonBlock className="h-96" />
      </div>
    </>
  );
}

export function SettingsClient() {
  const { user, isLoading: authLoading } = useAuth();
  const [sections, setSections] = useState<SettingsSection[]>([]);
  const [effectivePermissions, setEffectivePermissions] = useState<AccessPermissionKey[]>([]);
  const [priority, setPriority] = useState<SettingsPriorityResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const actionablePriority =
    priority && isSettingsPriorityOperable(priority, sections, effectivePermissions)
      ? priority
      : null;
  const priorityCopy = actionablePriority?.item
    ? getSettingsPriorityPresentation(actionablePriority.item)
    : null;

  const loadSettings = useCallback(async () => {
    if (!user) {
      setError(SETTINGS_HUB_COPY.sessionUnavailable);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [sectionsResult, permissionsResult, priorityResult] = await Promise.allSettled([
        configurationApi.settingsSections.list(),
        accessControlApi.getMyEffectivePermissions(),
        configurationApi.settingsPriority.get(),
      ]);

      if (sectionsResult.status !== 'fulfilled') {
        throw sectionsResult.reason;
      }

      if (permissionsResult.status !== 'fulfilled') {
        setError(mapPermissionsError(permissionsResult.reason));
        return;
      }

      setSections(sectionsResult.value);
      setEffectivePermissions(permissionsResult.value.effectivePermissions);
      setPriority(priorityResult.status === 'fulfilled' ? priorityResult.value : null);
    } catch (loadError) {
      setError(mapRegistryError(loadError));
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
            <Button type="button" variant="secondary" size="lg" onClick={() => void loadSettings()}>
              {SETTINGS_HUB_COPY.retryAction}
            </Button>
          }
          icon={AlertTriangle}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={SETTINGS_HUB_COPY.pageTitle} subtitle={SETTINGS_HUB_COPY.pageSubtitle} />

      {actionablePriority && priorityCopy ? (
        <PortalPanel
          eyebrow={SETTINGS_HUB_COPY.priorityEyebrow}
          title={priorityCopy.title}
          description={priorityCopy.description}
          className="border-iwana-primary/15 bg-iwana-surface-soft dark:border-dark-border dark:bg-dark-surface-3"
          actions={
            <Button asChild={true} size="lg">
              <Link href={actionablePriority.item.targetPath}>{priorityCopy.actionLabel}</Link>
            </Button>
          }
          children={null}
        />
      ) : null}

      <SettingsSectionGrid sections={sections} effectivePermissions={effectivePermissions} />
    </div>
  );
}
