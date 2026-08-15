import {
  AccessPermissionKey,
  SettingsPriorityEvaluation,
  SettingsPriorityKey,
  SettingsPriorityLevel,
  SettingsPriorityState,
  SettingsSectionKey,
  SettingsSectionStatus,
  type SettingsPriorityResponse,
} from '@iwana/shared';
import type { SettingsSection } from '@/lib/api-client';
import {
  getSettingsPriorityPresentation,
  hasAllSettingsSectionPermissions,
  isSettingsPriorityOperable,
} from './settings-priority';

const accessSection: SettingsSection = {
  key: SettingsSectionKey.ACCESS,
  label: 'Perfiles de acceso',
  description: 'Perfiles y autenticación.',
  ownerModule: 'Configuración',
  status: SettingsSectionStatus.AVAILABLE,
  route: '/dashboard/settings/access',
  requiredPermissions: [
    AccessPermissionKey.SETTINGS_READ,
    AccessPermissionKey.ACCESS_PERMISSIONS_READ,
  ],
};

const actionablePriority: SettingsPriorityResponse = {
  state: SettingsPriorityState.ACTION_REQUIRED,
  item: {
    key: SettingsPriorityKey.MFA_POLICY_DISABLED,
    level: SettingsPriorityLevel.HIGH,
    sectionKey: SettingsSectionKey.ACCESS,
    targetPath: '/dashboard/settings/access#politicas-de-autenticacion',
  },
  evaluation: SettingsPriorityEvaluation.COMPLETE,
  unknownSources: [],
};

describe('settings-priority presentation and gating', () => {
  it('maps every contractual key to canonical portal copy', () => {
    expect(getSettingsPriorityPresentation(actionablePriority.item!)).toEqual({
      title: 'Activa la verificación en dos pasos',
      description:
        'Protege el acceso de toda la empresa haciendo obligatoria la verificación en dos pasos.',
      actionLabel: 'Configurar verificación',
    });

    expect(
      Object.values(SettingsPriorityKey).map((key) =>
        getSettingsPriorityPresentation({
          key,
          level: SettingsPriorityLevel.LOW,
          sectionKey: SettingsSectionKey.ACCESS,
          targetPath: accessSection.route!,
        }),
      ),
    ).toHaveLength(5);
  });

  it('allows an actionable priority only when the destination is operable', () => {
    expect(
      isSettingsPriorityOperable(
        actionablePriority,
        [accessSection],
        [AccessPermissionKey.SETTINGS_READ, AccessPermissionKey.ACCESS_PERMISSIONS_READ],
      ),
    ).toBe(true);
    expect(
      isSettingsPriorityOperable(
        actionablePriority,
        [accessSection],
        [AccessPermissionKey.SETTINGS_READ],
      ),
    ).toBe(false);
    expect(
      isSettingsPriorityOperable(
        {
          ...actionablePriority,
          item: { ...actionablePriority.item!, targetPath: '/dashboard/settings/branding' },
        },
        [accessSection],
        [AccessPermissionKey.SETTINGS_READ, AccessPermissionKey.ACCESS_PERMISSIONS_READ],
      ),
    ).toBe(false);
  });

  it.each([SettingsPriorityState.NONE, SettingsPriorityState.UNKNOWN])(
    'hides a non-actionable state: %s',
    (state) => {
      expect(
        isSettingsPriorityOperable(
          { ...actionablePriority, state, item: null },
          [accessSection],
          [AccessPermissionKey.SETTINGS_READ, AccessPermissionKey.ACCESS_PERMISSIONS_READ],
        ),
      ).toBe(false);
    },
  );

  it('hides a priority when its section is unavailable', () => {
    expect(
      isSettingsPriorityOperable(
        actionablePriority,
        [{ ...accessSection, status: SettingsSectionStatus.COMING_SOON }],
        [AccessPermissionKey.SETTINGS_READ, AccessPermissionKey.ACCESS_PERMISSIONS_READ],
      ),
    ).toBe(false);
  });

  it('centralizes the section permission check', () => {
    expect(
      hasAllSettingsSectionPermissions(accessSection, [
        AccessPermissionKey.SETTINGS_READ,
        AccessPermissionKey.ACCESS_PERMISSIONS_READ,
      ]),
    ).toBe(true);
    expect(hasAllSettingsSectionPermissions(accessSection, [])).toBe(false);
  });
});
