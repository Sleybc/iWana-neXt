import { type AccessPermissionKey, type UserRole } from '@iwana/shared';
import type { AccessProfileView } from '@/lib/api-client';

interface BuildCompanyRolePreviewInput {
  baseRole: UserRole | null | undefined;
  selectedProfileIds: string[];
  profiles: AccessProfileView[];
  compatibilityMatrix: Record<UserRole, AccessPermissionKey[]>;
}

interface CompanyRolePreviewResult {
  selectedProfiles: AccessProfileView[];
  permissionKeys: AccessPermissionKey[];
}

export function buildCompanyRolePreview({
  baseRole,
  selectedProfileIds,
  profiles,
  compatibilityMatrix,
}: BuildCompanyRolePreviewInput): CompanyRolePreviewResult {
  if (!baseRole) {
    return {
      selectedProfiles: [],
      permissionKeys: [],
    };
  }

  const selectedProfiles = profiles.filter(
    (profile) =>
      profile.isActive &&
      profile.baseRoleConstraint === baseRole &&
      selectedProfileIds.includes(profile.id),
  );

  const permissionKeys = [
    ...(compatibilityMatrix[baseRole] ?? []),
    ...selectedProfiles.flatMap((profile) => profile.permissions),
  ].reduce<AccessPermissionKey[]>((accumulator, permissionKey) => {
    if (!accumulator.includes(permissionKey)) {
      accumulator.push(permissionKey);
    }

    return accumulator;
  }, []);

  return {
    selectedProfiles,
    permissionKeys,
  };
}
