'use client';

import { AlertTriangle, Eye } from 'lucide-react';
import { Badge, cn } from '@iwana/ui';
import type { DashboardAlert, TenantSelf, TenantSelfSettings } from '@/lib/api-client';

interface SettingsOverviewPanelProps {
  profile: TenantSelf;
  settings: TenantSelfSettings;
  alerts: DashboardAlert[];
  canEdit: boolean;
}

function resolveTenantStatusLabel(status: TenantSelf['status']): string {
  switch (status) {
    case 'ACTIVE':
      return 'Activo';
    case 'SUSPENDED':
      return 'Suspendido';
    case 'PROVISIONING':
      return 'Provisionando';
    case 'PROVISIONING_FAILED':
      return 'Provisioning fallido';
    default:
      return status;
  }
}

export function SettingsOverviewPanel({
  profile,
  settings,
  alerts,
  canEdit,
}: SettingsOverviewPanelProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3',
        'border-gray-200 bg-white dark:border-dark-border dark:bg-dark-surface-2',
      )}
    >
      {/* Identidad y estado del tenant */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-gray-900 dark:text-white">{profile.name}</span>
        <Badge
          variant={
            profile.status === 'ACTIVE'
              ? 'success'
              : profile.status === 'SUSPENDED'
                ? 'error'
                : 'warning'
          }
        >
          {resolveTenantStatusLabel(profile.status)}
        </Badge>
        <Badge variant={settings.features.mfa_required_all ? 'success' : 'warning'}>
          {settings.features.mfa_required_all ? 'MFA activa' : 'MFA pendiente'}
        </Badge>
        <span className="text-gray-400 dark:text-gray-500">·</span>
        <span className="text-gray-500 dark:text-gray-400">{profile.slug}</span>
        <span className="text-gray-400 dark:text-gray-500">·</span>
        <span className="text-gray-500 dark:text-gray-400">{profile.contactEmail}</span>
        {alerts.length > 0 && (
          <>
            <span className="text-gray-400 dark:text-gray-500">·</span>
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              {alerts.length} alerta{alerts.length !== 1 ? 's' : ''}
            </span>
          </>
        )}
      </div>

      {/* Aviso solo lectura — texto exacto requerido por test E2E NOC (e2e/tests/portal-settings-empresa.spec.ts) */}
      {!canEdit && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
          <Eye className="h-3.5 w-3.5 shrink-0" />
          Vista solo lectura para tu rol
        </div>
      )}
    </div>
  );
}
