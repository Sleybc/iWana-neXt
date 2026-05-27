'use client';

import { type AccessPermissionKey, type UserRole } from '@iwana/shared';
import type { AccessPermissionsCatalog, AccessProfileView } from '@/lib/api-client';
import { getAccessProfileDisplayName } from '@/lib/system-vocabulary';
import { PortalAlert, PortalSectionHeader } from '@/components/shared/portal-ui';
import { buildCompanyRolePreview } from './company-role-preview';

interface CompanyRolesAssignmentSectionProps {
  baseRole: UserRole | null | undefined;
  availableProfiles: AccessProfileView[];
  selectedProfileIds: string[];
  compatibilityMatrix: Record<UserRole, AccessPermissionKey[]>;
  catalog: AccessPermissionsCatalog | null;
  onToggleProfile: (profileId: string) => void;
}

function resolvePermissionLabel(
  permissionKey: AccessPermissionKey,
  catalog: AccessPermissionsCatalog | null,
): string {
  return (
    catalog?.permissions.find((permission) => permission.permissionKey === permissionKey)
      ?.description ?? permissionKey
  );
}

export function CompanyRolesAssignmentSection({
  baseRole,
  availableProfiles,
  selectedProfileIds,
  compatibilityMatrix,
  catalog,
  onToggleProfile,
}: CompanyRolesAssignmentSectionProps) {
  if (!baseRole) {
    return (
      <PortalAlert
        variant="info"
        title="Selecciona una categoría base"
        description="Primero elige la categoría base para habilitar perfiles de acceso compatibles."
      />
    );
  }

  const compatibleProfiles = availableProfiles.filter(
    (profile) => profile.isActive && profile.baseRoleConstraint === baseRole,
  );

  const preview = buildCompanyRolePreview({
    baseRole,
    selectedProfileIds,
    profiles: compatibleProfiles,
    compatibilityMatrix,
  });

  return (
    <div className="space-y-4 rounded-2xl border border-gray-200 bg-[#f8faf5] p-4 dark:border-dark-border dark:bg-dark-surface-3">
      <PortalSectionHeader
        className="gap-0"
        eyebrow="Acceso operativo"
        title="Perfiles de acceso"
        description="Asigna perfiles de acceso compatibles con la categoría base seleccionada."
      />

      {compatibleProfiles.length > 0 ? (
        <div className="grid gap-3">
          {compatibleProfiles.map((profile) => {
            const profileName = getAccessProfileDisplayName(profile);

            return (
              <label
                key={profile.id}
                className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-200"
              >
                <input
                  type="checkbox"
                  checked={selectedProfileIds.includes(profile.id)}
                  onChange={() => onToggleProfile(profile.id)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-iwana-primary"
                  aria-label={profileName}
                />
                <span>
                  <span className="block font-medium text-gray-900 dark:text-white">
                    {profileName}
                  </span>
                  <span className="mt-1 block text-sm text-gray-500 dark:text-gray-400">
                    {profile.description || 'Perfil de acceso sin descripción'}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <PortalAlert
          variant="info"
          title="Sin perfiles compatibles"
          description="No hay perfiles de acceso activos para la categoría base seleccionada."
        />
      )}

      <PortalAlert
        variant="info"
        title="Permisos efectivos"
        description={
          preview.permissionKeys.length > 0
            ? preview.permissionKeys
                .map((permissionKey) => resolvePermissionLabel(permissionKey, catalog))
                .join(' · ')
            : 'No hay permisos efectivos calculados todavía.'
        }
      />
    </div>
  );
}
