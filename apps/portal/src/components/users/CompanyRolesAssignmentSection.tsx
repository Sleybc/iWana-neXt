'use client';

import { type AccessPermissionKey, type UserRole } from '@iwana/shared';
import type { AccessPermissionsCatalog, AccessProfileView } from '@/lib/api-client';
import { getAccessProfileDisplayName } from '@/lib/system-vocabulary';
import { PortalAlert } from '@/components/shared/portal-ui';
import { SectionAccordion } from '@iwana/ui';
import { buildCompanyRolePreview } from './company-role-preview';

interface CompanyRolesAssignmentSectionProps {
  baseRole: UserRole | null | undefined;
  availableProfiles: AccessProfileView[];
  selectedProfileIds: string[];
  compatibilityMatrix: Record<UserRole, AccessPermissionKey[]>;
  catalog: AccessPermissionsCatalog | null;
  onToggleProfile: (profileId: string) => void;
  /**
   * `accordion` (default): bloque colapsable — útil en alta.
   * `flat`: lista directa sin acordeón anidado — preferible en side peek de edición.
   */
  layout?: 'accordion' | 'flat';
}

function formatPermissionFallback(permissionKey: string): string {
  const normalized = permissionKey.replace(/_/g, ' ').toLocaleLowerCase('es-CO');
  return normalized.charAt(0).toLocaleUpperCase('es-CO') + normalized.slice(1);
}

function resolvePermissionLabel(
  permissionKey: AccessPermissionKey,
  catalog: AccessPermissionsCatalog | null,
): string {
  return (
    catalog?.permissions.find((permission) => permission.permissionKey === permissionKey)
      ?.description ?? formatPermissionFallback(permissionKey)
  );
}

const PERMISSION_PREVIEW_LIMIT = 6;

function formatPermissionPreview(
  permissionKeys: AccessPermissionKey[],
  catalog: AccessPermissionsCatalog | null,
): string {
  if (permissionKeys.length === 0) {
    return 'No hay accesos finales calculados todavía.';
  }

  const labels = permissionKeys
    .slice(0, PERMISSION_PREVIEW_LIMIT)
    .map((permissionKey) => resolvePermissionLabel(permissionKey, catalog));
  const remaining = permissionKeys.length - labels.length;
  if (remaining > 0) {
    labels.push(`${remaining} más`);
  }
  return labels.join(' · ');
}

function ProfilesContent({
  compatibleProfiles,
  selectedProfileIds,
  onToggleProfile,
  previewDescription,
}: {
  compatibleProfiles: AccessProfileView[];
  selectedProfileIds: string[];
  onToggleProfile: (profileId: string) => void;
  previewDescription: string;
}) {
  return (
    <div className="space-y-3">
      {compatibleProfiles.length > 0 ? (
        <div className="grid gap-2">
          {compatibleProfiles.map((profile) => {
            const profileName = getAccessProfileDisplayName(profile);

            return (
              <label
                key={profile.id}
                className="flex items-start gap-3 rounded-xl border border-gray-200 bg-iwana-surface-soft/60 px-3 py-2.5 text-sm text-gray-700 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200"
              >
                <input
                  type="checkbox"
                  checked={selectedProfileIds.includes(profile.id)}
                  onChange={() => onToggleProfile(profile.id)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-iwana-primary"
                  aria-label={profileName}
                />
                <span className="min-w-0">
                  <span className="block font-medium text-gray-900 dark:text-white">
                    {profileName}
                  </span>
                  {profile.description ? (
                    <span className="mt-0.5 block text-xs leading-5 text-gray-500 dark:text-gray-400">
                      {profile.description}
                    </span>
                  ) : null}
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

      {compatibleProfiles.length > 0 ? (
        <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
          <span className="font-medium text-gray-700 dark:text-gray-300">Accesos finales: </span>
          {previewDescription}
        </p>
      ) : null}
    </div>
  );
}

export function CompanyRolesAssignmentSection({
  baseRole,
  availableProfiles,
  selectedProfileIds,
  compatibilityMatrix,
  catalog,
  onToggleProfile,
  layout = 'accordion',
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
  const previewDescription = formatPermissionPreview(preview.permissionKeys, catalog);

  const content = (
    <ProfilesContent
      compatibleProfiles={compatibleProfiles}
      selectedProfileIds={selectedProfileIds}
      onToggleProfile={onToggleProfile}
      previewDescription={previewDescription}
    />
  );

  if (layout === 'flat') {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Perfiles de acceso</p>
        {content}
      </div>
    );
  }

  return (
    <SectionAccordion
      variant="default"
      {...(compatibleProfiles.length > 0 ? { defaultOpen: 'access-profiles' } : {})}
      items={[
        {
          id: 'access-profiles',
          label: 'Perfiles de acceso',
          description: 'Acceso operativo',
          children: content,
        },
      ]}
    />
  );
}
