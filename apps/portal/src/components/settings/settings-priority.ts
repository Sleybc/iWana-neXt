import {
  AccessPermissionKey,
  SettingsSectionStatus,
  SettingsPriorityState,
  type SettingsPriorityItem,
  type SettingsPriorityResponse,
} from '@iwana/shared';
import type { SettingsSection } from '@/lib/api-client';
import { SETTINGS_PRIORITY_COPY } from './mod00-settings-labels';

export type SettingsPriorityPresentation =
  (typeof SETTINGS_PRIORITY_COPY)[keyof typeof SETTINGS_PRIORITY_COPY];

export function getSettingsPriorityPresentation(
  item: SettingsPriorityItem,
): SettingsPriorityPresentation {
  return SETTINGS_PRIORITY_COPY[item.key];
}

export function hasAllSettingsSectionPermissions(
  section: SettingsSection,
  effectivePermissions: AccessPermissionKey[],
): boolean {
  return section.requiredPermissions.every((permission) =>
    effectivePermissions.includes(permission),
  );
}

function isTargetPathInsideSection(targetPath: string, sectionRoute: string): boolean {
  return targetPath === sectionRoute || targetPath.startsWith(`${sectionRoute}#`);
}

/**
 * Evita promover una prioridad cuando el destino no es una superficie operable
 * para la sesión actual. La API decide la prioridad; el portal solo valida la
 * capacidad de navegación que conoce localmente.
 */
export function isSettingsPriorityOperable(
  priority: SettingsPriorityResponse | null,
  sections: SettingsSection[],
  effectivePermissions: AccessPermissionKey[],
): priority is SettingsPriorityResponse & {
  state: SettingsPriorityState.ACTION_REQUIRED;
  item: SettingsPriorityItem;
} {
  if (priority?.state !== SettingsPriorityState.ACTION_REQUIRED || !priority.item) {
    return false;
  }

  const section = sections.find((candidate) => candidate.key === priority.item?.sectionKey);

  return Boolean(
    section &&
    section.status === SettingsSectionStatus.AVAILABLE &&
    section.route &&
    hasAllSettingsSectionPermissions(section, effectivePermissions) &&
    isTargetPathInsideSection(priority.item.targetPath, section.route),
  );
}
