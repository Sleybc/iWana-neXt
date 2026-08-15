import {
  SettingsPriorityEvaluation,
  SettingsPriorityKey,
  SettingsPriorityLevel,
  SettingsPrioritySource,
  SettingsPriorityState,
  SettingsSectionKey,
  type SettingsPriorityItem,
  type SettingsPriorityResponse,
} from '@iwana/shared';
import type { SettingsPriorityOrganizationSnapshot } from '../../organization/ports/settings-priority-organization-read.port';
import type { SettingsPriorityTenantSnapshot } from '../../tenant/ports/settings-priority-tenant-read.port';
import type { SettingsPriorityUsersSnapshot } from '../../users/ports/settings-priority-users-read.port';

export interface SettingsPriorityEvaluationInput {
  tenant: SettingsPriorityTenantSnapshot | null;
  users: SettingsPriorityUsersSnapshot | null;
  organization: SettingsPriorityOrganizationSnapshot | null;
  unknownSources: SettingsPrioritySource[];
}

const MFA_TARGET = '/dashboard/settings/access#politicas-de-autenticacion';

function resolvePriorityItem({
  tenant,
  users,
  organization,
}: SettingsPriorityEvaluationInput): SettingsPriorityItem | null {
  if (tenant?.mfaRequiredAll === false) {
    return {
      key: SettingsPriorityKey.MFA_POLICY_DISABLED,
      level: SettingsPriorityLevel.HIGH,
      sectionKey: SettingsSectionKey.ACCESS,
      targetPath: MFA_TARGET,
    };
  }

  if (
    tenant?.mfaRequiredAll === true &&
    users !== null &&
    users.activeUsers > 0 &&
    users.mfaEnabledActiveUsers < users.activeUsers
  ) {
    return {
      key: SettingsPriorityKey.MFA_ENROLLMENT_INCOMPLETE,
      level: SettingsPriorityLevel.HIGH,
      sectionKey: SettingsSectionKey.ACCESS,
      targetPath: MFA_TARGET,
    };
  }

  if (organization?.activeOrganizationSites === 0) {
    return {
      key: SettingsPriorityKey.NO_ACTIVE_ORGANIZATION_SITE,
      level: SettingsPriorityLevel.MEDIUM,
      sectionKey: SettingsSectionKey.ORGANIZATION,
      targetPath: '/dashboard/settings/organization#sedes',
    };
  }

  if (organization?.validOpenCompanyDays === 0) {
    return {
      key: SettingsPriorityKey.COMPANY_HOURS_NOT_CONFIGURED,
      level: SettingsPriorityLevel.MEDIUM,
      sectionKey: SettingsSectionKey.CALENDAR,
      targetPath: '/dashboard/settings/calendar#horario-base',
    };
  }

  if (tenant?.brandingCustomized === false) {
    return {
      key: SettingsPriorityKey.BRANDING_NOT_CUSTOMIZED,
      level: SettingsPriorityLevel.LOW,
      sectionKey: SettingsSectionKey.BRANDING,
      targetPath: '/dashboard/settings/branding',
    };
  }

  return null;
}

export function evaluateSettingsPriority(
  input: SettingsPriorityEvaluationInput,
): SettingsPriorityResponse {
  const item = resolvePriorityItem(input);
  const isPartial = input.unknownSources.length > 0;

  if (item) {
    return {
      state: SettingsPriorityState.ACTION_REQUIRED,
      item,
      evaluation: isPartial
        ? SettingsPriorityEvaluation.PARTIAL
        : SettingsPriorityEvaluation.COMPLETE,
      unknownSources: input.unknownSources,
    };
  }

  return {
    state: isPartial ? SettingsPriorityState.UNKNOWN : SettingsPriorityState.NONE,
    item: null,
    evaluation: isPartial
      ? SettingsPriorityEvaluation.PARTIAL
      : SettingsPriorityEvaluation.COMPLETE,
    unknownSources: input.unknownSources,
  };
}
