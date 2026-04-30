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
    case 'INACTIVE':
      return 'Inactivo';
    case 'MARKED_FOR_DELETION':
      return 'En eliminación';
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
        'rounded-[24px] border border-white/70 bg-white/95 p-5 shadow-iwana-card',
        'dark:border-dark-border dark:bg-dark-surface-2/95',
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
              Resumen operativo
            </p>
            <h2 className="text-xl font-semibold text-iwana-primary dark:text-white">
              {profile.name}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge
              variant={
                profile.status === 'ACTIVE'
                  ? 'success'
                  : profile.status === 'SUSPENDED' || profile.status === 'MARKED_FOR_DELETION'
                    ? 'error'
                    : profile.status === 'INACTIVE'
                      ? 'neutral'
                      : 'warning'
              }
            >
              {resolveTenantStatusLabel(profile.status)}
            </Badge>
            <Badge variant={settings.features.mfa_required_all ? 'success' : 'warning'}>
              {settings.features.mfa_required_all ? 'MFA activa' : 'MFA pendiente'}
            </Badge>
            {alerts.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                {alerts.length} alerta{alerts.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-3 text-sm text-gray-600 dark:text-gray-400">
            <div className="rounded-2xl border border-gray-200 bg-[#f8faf5] px-3 py-2 dark:border-dark-border dark:bg-dark-surface-3">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                Slug
              </span>
              <span className="font-medium text-gray-900 dark:text-white">{profile.slug}</span>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-[#f8faf5] px-3 py-2 dark:border-dark-border dark:bg-dark-surface-3">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                Contacto
              </span>
              <span className="font-medium text-gray-900 dark:text-white">
                {profile.contactEmail}
              </span>
            </div>
          </div>
        </div>

        {/* Aviso solo lectura — texto exacto requerido por test E2E NOC (e2e/tests/portal-settings-empresa.spec.ts) */}
        {!canEdit && (
          <div className="flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
            <Eye className="h-3.5 w-3.5 shrink-0" />
            Vista solo lectura para tu rol
          </div>
        )}
      </div>
    </div>
  );
}
