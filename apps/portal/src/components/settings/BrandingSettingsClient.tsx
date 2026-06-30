'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { UserRole } from '@iwana/shared';
import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { ApiError, tenantSelfApi, type TenantSelf } from '@/lib/api-client';
import { PortalAlert, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { BrandingForm } from './BrandingForm';
import { BRANDING_SETTINGS_COPY } from './mod00-settings-labels';

function mapBrandingError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return BRANDING_SETTINGS_COPY.authExpired;
    if (error.status === 403) return BRANDING_SETTINGS_COPY.forbidden;
    return error.message;
  }

  return BRANDING_SETTINGS_COPY.loadError;
}

export function BrandingSettingsClient() {
  const { user, isLoading: authLoading } = useAuth();
  const [profile, setProfile] = useState<TenantSelf | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      setError(BRANDING_SETTINGS_COPY.sessionUnavailable);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      setProfile(await tenantSelfApi.getProfile());
    } catch (loadError) {
      setError(mapBrandingError(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    void loadProfile();
  }, [authLoading, loadProfile]);

  if (authLoading || isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={BRANDING_SETTINGS_COPY.pageTitle}
          subtitle={BRANDING_SETTINGS_COPY.loadingSubtitle}
        />
        <PortalSkeletonBlock className="h-96" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={BRANDING_SETTINGS_COPY.pageTitle}
          subtitle={BRANDING_SETTINGS_COPY.errorSubtitle}
        />
        <PortalAlert
          variant="error"
          title="Vista temporalmente no disponible"
          description={error ?? 'No se pudo cargar la identidad visual.'}
          icon={AlertTriangle}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={BRANDING_SETTINGS_COPY.pageTitle}
        subtitle={BRANDING_SETTINGS_COPY.pageSubtitle}
      />
      <BrandingForm
        profile={profile}
        canEdit={user?.role === UserRole.ADMIN}
        onUpdated={setProfile}
      />
    </div>
  );
}
