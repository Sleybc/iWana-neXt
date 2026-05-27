'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { UserRole } from '@iwana/shared';
import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { PortalAlert, PortalPanel, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { FIELD_OPERATIONS_SETTINGS_COPY } from './mod00-settings-labels';

function FieldOperationsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <PortalSkeletonBlock className="h-24" />
      <PortalSkeletonBlock className="h-72" />
      <PortalSkeletonBlock className="h-72" />
    </div>
  );
}

export function FieldOperationsSettingsClient() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={FIELD_OPERATIONS_SETTINGS_COPY.pageTitle}
          subtitle={FIELD_OPERATIONS_SETTINGS_COPY.loadingSubtitle}
        />
        <FieldOperationsSkeleton />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={FIELD_OPERATIONS_SETTINGS_COPY.pageTitle}
          subtitle={FIELD_OPERATIONS_SETTINGS_COPY.authRequiredSubtitle}
        />
        <PortalAlert
          variant="error"
          title="Vista temporalmente no disponible"
          description={FIELD_OPERATIONS_SETTINGS_COPY.authRequiredDescription}
          icon={AlertTriangle}
        />
      </div>
    );
  }

  const canEdit = user.role === UserRole.ADMIN;

  return (
    <div className="space-y-6">
      <PageHeader
        title={FIELD_OPERATIONS_SETTINGS_COPY.pageTitle}
        subtitle={FIELD_OPERATIONS_SETTINGS_COPY.pageSubtitle}
      />
      <PortalPanel
        title={FIELD_OPERATIONS_SETTINGS_COPY.panelTitle}
        description={FIELD_OPERATIONS_SETTINGS_COPY.panelDescription}
      >
        <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-[#f8faf5] px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
              {canEdit
                ? FIELD_OPERATIONS_SETTINGS_COPY.canEditHint
                : FIELD_OPERATIONS_SETTINGS_COPY.readOnlyHint}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {FIELD_OPERATIONS_SETTINGS_COPY.helperText}
            </p>
          </div>
          <Link
            href="/dashboard/settings/calendar"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:border-gray-300 hover:text-gray-900 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-300 dark:hover:text-white"
          >
            Ir a Calendario operativo y jornadas →
          </Link>
        </div>
      </PortalPanel>
    </div>
  );
}
