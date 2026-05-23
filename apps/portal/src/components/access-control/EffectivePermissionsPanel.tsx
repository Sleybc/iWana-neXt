'use client';

import { ShieldCheck } from 'lucide-react';
import { PortalEmptyState, PortalPanel } from '@/components/shared/portal-ui';
import { type AccessPermissionsCatalog, type EffectivePermissionsSummary } from '@/lib/api-client';

interface EffectivePermissionsPanelProps {
  summary: EffectivePermissionsSummary | null;
  catalog: AccessPermissionsCatalog | null;
  selectedUserLabel: string | null;
  isLoading: boolean;
  error: string | null;
}

function resolvePermissionLabel(
  permissionKey: string,
  catalog: AccessPermissionsCatalog | null,
): string {
  return (
    catalog?.permissions.find((permission) => permission.permissionKey === permissionKey)
      ?.description ?? permissionKey
  );
}

export function EffectivePermissionsPanel({
  summary,
  catalog,
  selectedUserLabel,
  isLoading,
  error,
}: EffectivePermissionsPanelProps) {
  return (
    <PortalPanel
      title="Permisos efectivos"
      description={
        selectedUserLabel
          ? `Resumen del acceso real para ${selectedUserLabel}.`
          : 'Selecciona un usuario para revisar el acceso efectivo calculado por backend.'
      }
    >
      {isLoading ? (
        <div className="h-28 animate-pulse rounded-2xl bg-gray-100 dark:bg-dark-surface-3" />
      ) : null}

      {!isLoading && error ? (
        <PortalEmptyState title="Sin resumen disponible" description={error} icon={ShieldCheck} />
      ) : null}

      {!isLoading && !error && !summary ? (
        <PortalEmptyState
          title="Selecciona un usuario"
          description="El resumen mostrará permisos base del rol y permisos concedidos por perfiles activos."
          icon={ShieldCheck}
        />
      ) : null}

      {!isLoading && !error && summary ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-[#f8faf5] px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
              Rol base
            </p>
            <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{summary.role}</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-900 dark:text-white">Permisos vigentes</p>
            <div className="flex flex-wrap gap-2">
              {summary.effectivePermissions.map((permissionKey) => (
                <span
                  key={permissionKey}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200"
                >
                  {resolvePermissionLabel(permissionKey, catalog)}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-900 dark:text-white">Origen del acceso</p>
            {summary.recoveryPermissions.length > 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-100">
                <p className="font-medium">Permisos base del rol</p>
                <p className="mt-1 text-sm">
                  {summary.recoveryPermissions
                    .map((permissionKey) => resolvePermissionLabel(permissionKey, catalog))
                    .join(' · ')}
                </p>
              </div>
            ) : null}

            {summary.profileSources.map((source) => (
              <div
                key={source.profileId}
                className="rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-dark-border dark:bg-dark-surface-2"
              >
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {source.profileName}
                </p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {source.permissions.length > 0
                    ? source.permissions
                        .map((permissionKey) => resolvePermissionLabel(permissionKey, catalog))
                        .join(' · ')
                    : 'Sin permisos activos adicionales.'}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </PortalPanel>
  );
}
