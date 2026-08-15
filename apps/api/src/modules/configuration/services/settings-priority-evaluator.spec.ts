import {
  SettingsPriorityEvaluation,
  SettingsPriorityKey,
  SettingsPriorityLevel,
  SettingsPrioritySource,
  SettingsPriorityState,
  SettingsSectionKey,
} from '@iwana/shared';
import { evaluateSettingsPriority } from './settings-priority-evaluator';

const readyTenant = {
  mfaRequiredAll: true,
  brandingCustomized: true,
};

const readyUsers = {
  activeUsers: 2,
  mfaEnabledActiveUsers: 2,
};

const readyOrganization = {
  activeOrganizationSites: 1,
  validOpenCompanyDays: 5,
};

describe('evaluateSettingsPriority', () => {
  it.each([
    {
      name: 'política MFA desactivada',
      input: { tenant: { ...readyTenant, mfaRequiredAll: false } },
      expected: {
        key: SettingsPriorityKey.MFA_POLICY_DISABLED,
        level: SettingsPriorityLevel.HIGH,
        sectionKey: SettingsSectionKey.ACCESS,
        targetPath: '/dashboard/settings/access#politicas-de-autenticacion',
      },
    },
    {
      name: 'personas activas sin MFA',
      input: { users: { ...readyUsers, mfaEnabledActiveUsers: 1 } },
      expected: {
        key: SettingsPriorityKey.MFA_ENROLLMENT_INCOMPLETE,
        level: SettingsPriorityLevel.HIGH,
        sectionKey: SettingsSectionKey.ACCESS,
        targetPath: '/dashboard/settings/access#politicas-de-autenticacion',
      },
    },
    {
      name: 'sin sedes activas',
      input: { organization: { ...readyOrganization, activeOrganizationSites: 0 } },
      expected: {
        key: SettingsPriorityKey.NO_ACTIVE_ORGANIZATION_SITE,
        level: SettingsPriorityLevel.MEDIUM,
        sectionKey: SettingsSectionKey.ORGANIZATION,
        targetPath: '/dashboard/settings/organization#sedes',
      },
    },
    {
      name: 'sin horario empresarial abierto',
      input: { organization: { ...readyOrganization, validOpenCompanyDays: 0 } },
      expected: {
        key: SettingsPriorityKey.COMPANY_HOURS_NOT_CONFIGURED,
        level: SettingsPriorityLevel.MEDIUM,
        sectionKey: SettingsSectionKey.CALENDAR,
        targetPath: '/dashboard/settings/calendar#horario-base',
      },
    },
    {
      name: 'sin marca personalizada',
      input: { tenant: { ...readyTenant, brandingCustomized: false } },
      expected: {
        key: SettingsPriorityKey.BRANDING_NOT_CUSTOMIZED,
        level: SettingsPriorityLevel.LOW,
        sectionKey: SettingsSectionKey.BRANDING,
        targetPath: '/dashboard/settings/branding',
      },
    },
  ])('selecciona la primera recomendación para $name', ({ input, expected }) => {
    const result = evaluateSettingsPriority({
      tenant: input.tenant ?? readyTenant,
      users: input.users ?? readyUsers,
      organization: input.organization ?? readyOrganization,
      unknownSources: [],
    });

    expect(result).toEqual({
      state: SettingsPriorityState.ACTION_REQUIRED,
      item: expected,
      evaluation: SettingsPriorityEvaluation.COMPLETE,
      unknownSources: [],
    });
  });

  it('respeta la precedencia y elige MFA antes que sede, calendario y marca', () => {
    const result = evaluateSettingsPriority({
      tenant: { mfaRequiredAll: false, brandingCustomized: false },
      users: { activeUsers: 3, mfaEnabledActiveUsers: 0 },
      organization: { activeOrganizationSites: 0, validOpenCompanyDays: 0 },
      unknownSources: [],
    });

    expect(result.item?.key).toBe(SettingsPriorityKey.MFA_POLICY_DISABLED);
  });

  it('no recomienda completar MFA cuando no hay usuarios activos', () => {
    const result = evaluateSettingsPriority({
      tenant: readyTenant,
      users: { activeUsers: 0, mfaEnabledActiveUsers: 0 },
      organization: readyOrganization,
      unknownSources: [],
    });

    expect(result).toEqual({
      state: SettingsPriorityState.NONE,
      item: null,
      evaluation: SettingsPriorityEvaluation.COMPLETE,
      unknownSources: [],
    });
  });

  it('retorna NONE cuando todas las fuentes están listas', () => {
    const result = evaluateSettingsPriority({
      tenant: readyTenant,
      users: readyUsers,
      organization: readyOrganization,
      unknownSources: [],
    });

    expect(result).toEqual({
      state: SettingsPriorityState.NONE,
      item: null,
      evaluation: SettingsPriorityEvaluation.COMPLETE,
      unknownSources: [],
    });
  });

  it('retorna UNKNOWN cuando no conoce una fuente y no hay acción conocida', () => {
    const result = evaluateSettingsPriority({
      tenant: readyTenant,
      users: null,
      organization: readyOrganization,
      unknownSources: [SettingsPrioritySource.USERS],
    });

    expect(result).toEqual({
      state: SettingsPriorityState.UNKNOWN,
      item: null,
      evaluation: SettingsPriorityEvaluation.PARTIAL,
      unknownSources: [SettingsPrioritySource.USERS],
    });
  });

  it('conserva una acción conocida y marca evaluación parcial', () => {
    const result = evaluateSettingsPriority({
      tenant: readyTenant,
      users: null,
      organization: { ...readyOrganization, activeOrganizationSites: 0 },
      unknownSources: [SettingsPrioritySource.USERS],
    });

    expect(result.state).toBe(SettingsPriorityState.ACTION_REQUIRED);
    expect(result.item?.key).toBe(SettingsPriorityKey.NO_ACTIVE_ORGANIZATION_SITE);
    expect(result.evaluation).toBe(SettingsPriorityEvaluation.PARTIAL);
    expect(result.unknownSources).toEqual([SettingsPrioritySource.USERS]);
  });
});
