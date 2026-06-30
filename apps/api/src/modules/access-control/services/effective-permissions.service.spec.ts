import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { EffectivePermissionsService } from './effective-permissions.service';

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db');
  return {
    ...actual,
    TenantContext: { getOrThrow: jest.fn() },
    runInTenantSchema: jest.fn(),
  };
});

describe('EffectivePermissionsService', () => {
  let service: EffectivePermissionsService;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [EffectivePermissionsService, { provide: getDataSourceToken(), useValue: {} }],
    }).compile();

    service = moduleRef.get(EffectivePermissionsService);

    (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
      tenantId: 'tenant-test',
      schemaName: 'tenant_test',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('incluye permisos de perfiles activos y vigentes compatibles con el rol base', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-1',
        tenantId: 'tenant-test',
        role: UserRole.NOC,
      }),
      find: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: 'assignment-1',
            profileId: 'profile-1',
            userId: 'user-1',
            tenantId: 'tenant-test',
            isActive: true,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'profile-1',
            tenantId: 'tenant-test',
            baseRoleConstraint: UserRole.NOC,
            isActive: true,
          },
        ])
        .mockResolvedValueOnce([
          {
            profileId: 'profile-1',
            tenantId: 'tenant-test',
            permissionKey: AccessPermissionKey.SETTINGS_READ,
          },
        ]),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(
      async (
        _dataSource,
        _schemaName,
        callback: (queryRunner: { manager: typeof manager }) => unknown,
      ) => callback({ manager }),
    );

    await expect(service.getEffectivePermissionsForUser('user-1')).resolves.toEqual([
      AccessPermissionKey.SETTINGS_READ,
    ]);
  });

  it('omite perfiles incompatibles con el rol base del usuario', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-2',
        tenantId: 'tenant-test',
        role: UserRole.SUPPORT,
      }),
      find: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: 'assignment-2',
            profileId: 'profile-2',
            userId: 'user-2',
            tenantId: 'tenant-test',
            isActive: true,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'profile-2',
            tenantId: 'tenant-test',
            baseRoleConstraint: UserRole.NOC,
            isActive: true,
          },
        ]),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(
      async (
        _dataSource,
        _schemaName,
        callback: (queryRunner: { manager: typeof manager }) => unknown,
      ) => callback({ manager }),
    );

    await expect(service.getEffectivePermissionsForUser('user-2')).resolves.toEqual([]);
  });

  it('otorga a ADMIN el baseline tenant completo aun sin perfiles activos', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-3',
        tenantId: 'tenant-test',
        role: UserRole.ADMIN,
      }),
      find: jest.fn().mockResolvedValue([]),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(
      async (
        _dataSource,
        _schemaName,
        callback: (queryRunner: { manager: typeof manager }) => unknown,
      ) => callback({ manager }),
    );

    const result = await service.getEffectivePermissionsForUser('user-3');

    expect(result).toEqual(
      expect.arrayContaining([
        AccessPermissionKey.SETTINGS_READ,
        AccessPermissionKey.ACCESS_PERMISSIONS_READ,
        AccessPermissionKey.ACCESS_PROFILES_READ,
        AccessPermissionKey.ACCESS_PROFILES_MANAGE,
        AccessPermissionKey.ACCESS_ASSIGNMENTS_MANAGE,
        AccessPermissionKey.ORGANIZATION_SITES_READ,
        AccessPermissionKey.ORGANIZATION_SITES_MANAGE,
        AccessPermissionKey.WFM_SCHEDULE_READ,
        AccessPermissionKey.WFM_SCHEDULE_MANAGE,
      ]),
    );
  });

  it('omite perfiles acotados a una sede distinta del contexto solicitado', async () => {
    const assignments = [
      {
        id: 'assignment-4',
        profileId: 'profile-site-norte',
        userId: 'user-4',
        tenantId: 'tenant-test',
        isActive: true,
      },
      {
        id: 'assignment-5',
        profileId: 'profile-global',
        userId: 'user-4',
        tenantId: 'tenant-test',
        isActive: true,
      },
    ];
    const profiles = [
      {
        id: 'profile-site-norte',
        tenantId: 'tenant-test',
        baseRoleConstraint: UserRole.SUPPORT,
        isActive: true,
        scopeSiteId: 'site-norte',
      },
      {
        id: 'profile-global',
        tenantId: 'tenant-test',
        baseRoleConstraint: UserRole.SUPPORT,
        isActive: true,
        scopeSiteId: null,
      },
    ];
    const permissions = [
      {
        profileId: 'profile-site-norte',
        tenantId: 'tenant-test',
        permissionKey: AccessPermissionKey.SETTINGS_MANAGE,
      },
      {
        profileId: 'profile-global',
        tenantId: 'tenant-test',
        permissionKey: AccessPermissionKey.SETTINGS_READ,
      },
    ];

    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-4',
        tenantId: 'tenant-test',
        role: UserRole.SUPPORT,
      }),
      find: jest
        .fn()
        .mockResolvedValueOnce(assignments)
        .mockResolvedValueOnce(profiles)
        .mockImplementationOnce(
          async (_entity, options: { where: { profileId: { value?: string[] | string } } }) => {
            const rawProfileIds = options.where.profileId.value;
            const profileIds = Array.isArray(rawProfileIds) ? rawProfileIds : [rawProfileIds];

            return permissions.filter((permission) => profileIds.includes(permission.profileId));
          },
        ),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(
      async (
        _dataSource,
        _schemaName,
        callback: (queryRunner: { manager: typeof manager }) => unknown,
      ) => callback({ manager }),
    );

    const result = await service.getEffectivePermissionsForUser('user-4', 'site-sur');

    expect(result).toEqual(expect.arrayContaining([AccessPermissionKey.SETTINGS_READ]));
    expect(result).not.toContain(AccessPermissionKey.SETTINGS_MANAGE);
  });
});
