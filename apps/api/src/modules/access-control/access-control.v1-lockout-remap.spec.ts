import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  AccessPermissionCatalog,
  AccessProfile,
  AccessProfilePermission,
  TenantContext,
  User,
  UserAccessProfile,
  runInTenantSchema,
} from '@iwana/db';
import {
  AccessPermissionAvailability,
  AccessPermissionCatalogVersion,
  AccessPermissionKey,
  UserRole,
} from '@iwana/shared';
import { AuditService } from '../audit/audit.service';
import {
  MOD00_ACCESS_V2_SYSTEM_ROLE_TEMPLATES,
  ROLE_ASSIGNABLE_PERMISSION_MATRIX_V2,
} from './access-control.constants';
import { AccessControlService } from './access-control.service';
import { AccessGovernanceService } from './services/access-governance.service';
import { EffectivePermissionsService } from './services/effective-permissions.service';

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db');
  return {
    ...actual,
    TenantContext: { getOrThrow: jest.fn() },
    runInTenantSchema: jest.fn(),
  };
});

const TENANT_ID = 'tenant-test';
const TECH_USER_ID = 'user-tech';
const ADMIN_USER_ID = 'user-admin';
const V1_TECH_ID = 'v1-tech';
const V2_TECH_ID = 'v2-tech';
const CUSTOM_ID = 'profile-custom';
const TIMESTAMP = new Date('2026-05-25T00:00:00.000Z');

const V2_TECH_KEYS = ROLE_ASSIGNABLE_PERMISSION_MATRIX_V2[UserRole.TECHNICIAN];

interface ProfileRow {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  baseRoleConstraint: UserRole | null;
  scopeSiteId: string | null;
  isSystem: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: null;
}

function findOperatorValues(operand: unknown): string[] {
  if (!operand || typeof operand !== 'object') {
    return [];
  }
  const candidate = operand as { value?: unknown; _value?: unknown };
  const raw = candidate.value ?? candidate._value;
  if (Array.isArray(raw)) {
    return raw.map(String);
  }
  if (typeof raw === 'string') {
    return [raw];
  }
  return [];
}

function catalogRows() {
  return Object.values(AccessPermissionKey).map((permissionKey) => ({
    tenantId: TENANT_ID,
    permissionKey,
    moduleKey: 'mock',
    action: 'mock',
    description: String(permissionKey),
    catalogVersion: AccessPermissionCatalogVersion.MOD00_ACCESS_V2,
    availability: AccessPermissionAvailability.ASSIGNABLE,
    isSystem: true,
    isActive: true,
  }));
}

function v2Templates(): ProfileRow[] {
  return MOD00_ACCESS_V2_SYSTEM_ROLE_TEMPLATES.map((template, index) => ({
    id: template.baseRoleConstraint === UserRole.TECHNICIAN ? V2_TECH_ID : `v2-${index}`,
    tenantId: TENANT_ID,
    name: template.name,
    description: template.description,
    baseRoleConstraint: template.baseRoleConstraint,
    scopeSiteId: null,
    isSystem: true,
    isActive: true,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    deletedAt: null,
  }));
}

function v1Technician(isActive: boolean) {
  return {
    id: V1_TECH_ID,
    tenantId: TENANT_ID,
    name: 'Técnico de campo',
    description: 'Plantilla inicial para agenda y ejecucion de trabajo de campo.',
    baseRoleConstraint: UserRole.TECHNICIAN,
    scopeSiteId: null,
    isSystem: true,
    isActive,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    deletedAt: null,
  };
}

describe('AccessControlService V1 lockout remap', () => {
  let service: AccessControlService;
  let auditService: { log: jest.Mock };
  let effectivePermissions: {
    invalidateByProfiles: jest.Mock;
    invalidateByProfile: jest.Mock;
    invalidateUserPermissions: jest.Mock;
    invalidateUsersPermissions: jest.Mock;
  };

  beforeEach(async () => {
    auditService = { log: jest.fn() };
    effectivePermissions = {
      invalidateUserPermissions: jest.fn().mockResolvedValue(undefined),
      invalidateUsersPermissions: jest.fn().mockResolvedValue(undefined),
      invalidateByProfile: jest.fn().mockResolvedValue(undefined),
      invalidateByProfiles: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AccessControlService,
        { provide: getDataSourceToken(), useValue: {} },
        { provide: AuditService, useValue: auditService },
        {
          provide: AccessGovernanceService,
          useValue: {
            assertUserProfilesMutationAllowed: jest.fn(),
            assertProfileMutationAllowed: jest.fn(),
          },
        },
        { provide: EffectivePermissionsService, useValue: effectivePermissions },
      ],
    }).compile();

    service = moduleRef.get(AccessControlService);
    (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
      tenantId: TENANT_ID,
      schemaName: 'tenant_test',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function installManager(options: {
    v1Active: boolean;
    v2TechActive?: boolean;
    extraAssignments?: Array<{
      id: string;
      userId: string;
      profileId: string;
      isActive: boolean;
    }>;
    extraProfiles?: ProfileRow[];
    extraPermissions?: Array<{ profileId: string; permissionKey: AccessPermissionKey }>;
    users?: Array<{ id: string; role: UserRole }>;
  }) {
    const v2TechActive = options.v2TechActive !== false;
    const profiles = [
      ...v2Templates().map((profile) =>
        profile.id === V2_TECH_ID ? { ...profile, isActive: v2TechActive } : profile,
      ),
      v1Technician(options.v1Active),
      ...(options.extraProfiles ?? []),
    ];
    const assignments = [
      {
        id: 'asg-v1-tech',
        tenantId: TENANT_ID,
        userId: TECH_USER_ID,
        profileId: V1_TECH_ID,
        validFrom: '2026-01-01',
        validTo: null as string | null,
        isActive: true,
      },
      ...(options.extraAssignments ?? []).map((entry) => ({
        tenantId: TENANT_ID,
        validFrom: '2026-01-01',
        validTo: null as string | null,
        ...entry,
      })),
    ];
    const permissions: Array<{
      tenantId: string;
      profileId: string;
      permissionKey: AccessPermissionKey;
    }> = [
      ...V2_TECH_KEYS.map((permissionKey) => ({
        tenantId: TENANT_ID,
        profileId: V2_TECH_ID,
        permissionKey,
      })),
      ...(options.extraPermissions ?? []).map((entry) => ({
        tenantId: TENANT_ID,
        ...entry,
      })),
    ];
    const users = options.users ?? [
      { id: TECH_USER_ID, tenantId: TENANT_ID, role: UserRole.TECHNICIAN },
      { id: ADMIN_USER_ID, tenantId: TENANT_ID, role: UserRole.ADMIN },
    ];

    const manager = {
      find: jest.fn(async (entity: unknown, findOptions?: { where?: Record<string, unknown> }) => {
        const where = findOptions?.where;
        if (entity === AccessPermissionCatalog) {
          return catalogRows();
        }
        if (entity === UserAccessProfile) {
          const userId = where && 'userId' in where ? String(where.userId) : undefined;
          const activeOnly = Boolean(where && 'isActive' in where && where.isActive === true);
          return assignments.filter((row) => {
            if (userId && row.userId !== userId) return false;
            if (activeOnly && !row.isActive) return false;
            return true;
          });
        }
        if (entity === AccessProfile) {
          if (where && 'name' in where) {
            const names = findOperatorValues(where.name);
            if (names.includes('Técnico de campo')) {
              return profiles.filter((profile) => profile.name === 'Técnico de campo');
            }
            if (names.length > 0) {
              return profiles.filter((profile) => names.includes(String(profile.name)));
            }
          }
          if (where && 'id' in where) {
            const ids = findOperatorValues(where.id);
            const activeOnly = Boolean(where && 'isActive' in where && where.isActive === true);
            return profiles.filter((profile) => {
              if (ids.length > 0 && !ids.includes(String(profile.id))) return false;
              if (activeOnly && !profile.isActive) return false;
              return true;
            });
          }
          if (where && 'isActive' in where) {
            return profiles.filter((profile) => profile.isActive === where.isActive);
          }
          return profiles;
        }
        if (entity === AccessProfilePermission) {
          if (where && 'profileId' in where) {
            const ids = findOperatorValues(where.profileId);
            if (ids.length > 0) {
              return permissions.filter((row) => ids.includes(row.profileId));
            }
            const single = String(where.profileId);
            return permissions.filter((row) => row.profileId === single);
          }
          return permissions;
        }
        return [];
      }),
      findOne: jest.fn(async (entity: unknown, findOptions?: { where?: { id?: string } }) => {
        if (entity === User) {
          return users.find((user) => user.id === findOptions?.where?.id) ?? null;
        }
        return null;
      }),
      create: jest.fn((_entity, value) => value),
      delete: jest.fn(async (_entity, criteria: { profileId?: string }) => {
        if (criteria?.profileId) {
          for (let i = permissions.length - 1; i >= 0; i -= 1) {
            const current = permissions[i];
            if (current?.profileId === criteria.profileId) {
              permissions.splice(i, 1);
            }
          }
        }
      }),
      query: jest.fn(async (sql: string) => {
        if (sql.includes('INSERT INTO user_access_profiles')) {
          const hasV2 = assignments.some(
            (row) => row.userId === TECH_USER_ID && row.profileId === V2_TECH_ID && row.isActive,
          );
          if (!hasV2) {
            assignments.push({
              id: 'asg-v2-tech',
              tenantId: TENANT_ID,
              userId: TECH_USER_ID,
              profileId: V2_TECH_ID,
              validFrom: '2026-08-29',
              validTo: null,
              isActive: true,
            });
          }
          return [];
        }
        if (sql.includes('UPDATE user_access_profiles')) {
          for (const row of assignments) {
            if (row.profileId === V1_TECH_ID && row.isActive) {
              row.isActive = false;
              row.validTo = '2026-08-29';
            }
          }
          return [];
        }
        return [];
      }),
      save: jest.fn(async (entity, value) => {
        if (entity === AccessProfilePermission && Array.isArray(value)) {
          for (const row of value as Array<{
            profileId: string;
            permissionKey: AccessPermissionKey;
          }>) {
            permissions.push({
              tenantId: TENANT_ID,
              profileId: row.profileId,
              permissionKey: row.permissionKey,
            });
          }
        }
        return value;
      }),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(
      async (
        _dataSource,
        _schemaName,
        callback: (queryRunner: { manager: typeof manager }) => unknown,
      ) => callback({ manager }),
    );

    return { manager, assignments, profiles };
  }

  it('TECHNICIAN con V1 activa queda con efectivos V2 tras listProfiles, no []', async () => {
    installManager({ v1Active: true });

    await service.listProfiles();
    const summary = await service.getEffectivePermissionsSummary(TECH_USER_ID);

    expect(summary.effectivePermissions).not.toEqual([]);
    expect(summary.effectivePermissions).toEqual(expect.arrayContaining(V2_TECH_KEYS));
    expect(summary.profileSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          profileId: V2_TECH_ID,
          profileName: 'Acceso estándar Técnico',
        }),
      ]),
    );
  });

  it('cura V1 ya inactiva con asignación viva: efectivos no vacíos', async () => {
    installManager({ v1Active: false });

    await service.listProfiles();
    const summary = await service.getEffectivePermissionsSummary(TECH_USER_ID);

    expect(summary.effectivePermissions).not.toEqual([]);
    expect(summary.effectivePermissions).toEqual(expect.arrayContaining(V2_TECH_KEYS));
  });

  it('ADMIN conserva baseline tras el seed', async () => {
    installManager({ v1Active: true });

    await service.listProfiles();
    const summary = await service.getEffectivePermissionsSummary(ADMIN_USER_ID);
    const adminBaseline = ROLE_ASSIGNABLE_PERMISSION_MATRIX_V2[UserRole.ADMIN];

    expect(summary.role).toBe(UserRole.ADMIN);
    expect(summary.effectivePermissions).toEqual(expect.arrayContaining(adminBaseline));
    expect(summary.recoveryPermissions).toEqual(expect.arrayContaining(adminBaseline));
  });

  it('usuario con personalizado activo y V1 no pierde el personalizado ni rompe unique', async () => {
    const customKeys = [AccessPermissionKey.SETTINGS_READ, AccessPermissionKey.WFM_SCHEDULE_READ];
    const { manager, assignments } = installManager({
      v1Active: true,
      extraProfiles: [
        {
          id: CUSTOM_ID,
          tenantId: TENANT_ID,
          name: 'Perfil de campo propio',
          description: 'Personalizado.',
          baseRoleConstraint: UserRole.TECHNICIAN,
          scopeSiteId: null,
          isSystem: false,
          isActive: true,
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
          deletedAt: null,
        },
      ],
      extraAssignments: [
        {
          id: 'asg-custom',
          userId: TECH_USER_ID,
          profileId: CUSTOM_ID,
          isActive: true,
        },
      ],
      extraPermissions: customKeys.map((permissionKey) => ({
        profileId: CUSTOM_ID,
        permissionKey,
      })),
    });

    await service.listProfiles();
    const summary = await service.getEffectivePermissionsSummary(TECH_USER_ID);

    const insertSql = String(
      manager.query.mock.calls.find((call: unknown[]) =>
        String(call[0]).includes('INSERT INTO user_access_profiles'),
      )?.[0],
    );
    expect(insertSql).toContain(
      'ON CONFLICT (tenant_id, user_id, profile_id) WHERE is_active = true DO NOTHING',
    );

    const activeAssignments = assignments.filter(
      (row) => row.userId === TECH_USER_ID && row.isActive,
    );
    expect(activeAssignments.map((row) => row.profileId).sort()).toEqual(
      [CUSTOM_ID, V2_TECH_ID].sort(),
    );
    expect(summary.profileSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ profileId: CUSTOM_ID }),
        expect.objectContaining({ profileId: V2_TECH_ID }),
      ]),
    );
    expect(summary.effectivePermissions).toEqual(expect.arrayContaining(customKeys));
    expect(summary.effectivePermissions).toEqual(expect.arrayContaining(V2_TECH_KEYS));
  });

  it('seed es idempotente: segunda listProfiles no duplica asignaciones V2', async () => {
    const { manager, assignments } = installManager({ v1Active: true });

    await service.listProfiles();
    await service.listProfiles();

    const v2Active = assignments.filter(
      (row) => row.userId === TECH_USER_ID && row.profileId === V2_TECH_ID && row.isActive,
    );
    expect(v2Active).toHaveLength(1);
    expect(manager.query.mock.calls.length).toBeGreaterThanOrEqual(4);
    const firstQuery = manager.query.mock.calls[0]?.[0];
    expect(typeof firstQuery).toBe('string');
    expect(String(firstQuery)).toContain(
      'ON CONFLICT (tenant_id, user_id, profile_id) WHERE is_active = true DO NOTHING',
    );
    expect(String(firstQuery)).toContain('v2.is_active = true');
  });

  it('invalida cache de V1 y V2 en el remap', async () => {
    installManager({ v1Active: true });

    await service.listProfiles({ userId: 'actor-admin', ipAddress: '203.0.113.10' });

    expect(effectivePermissions.invalidateByProfiles).toHaveBeenCalledWith(
      TENANT_ID,
      'tenant_test',
      expect.arrayContaining([V1_TECH_ID, V2_TECH_ID]),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        entityType: 'user_access_profiles',
        entityId: 'v1-to-v2-remap',
        userId: 'actor-admin',
        oldValue: { source: 'MOD00_ACCESS_V1_TEMPLATES' },
        newValue: expect.objectContaining({
          remappedProfileIds: expect.arrayContaining([V1_TECH_ID, V2_TECH_ID]),
        }),
      }),
    );
    const logged = auditService.log.mock.calls[0]?.[0] as {
      newValue?: Record<string, unknown>;
    };
    expect(JSON.stringify(logged)).not.toMatch(/@/);
    expect(logged.newValue).not.toHaveProperty('userIds');
  });
});
