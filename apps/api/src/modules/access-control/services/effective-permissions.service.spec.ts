import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { AccessPermissionKey, UserRole } from '@iwana/shared';
import { REDIS_CLIENT } from '../../redis/redis.module';
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
    const redisMock = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        EffectivePermissionsService,
        { provide: getDataSourceToken(), useValue: {} },
        { provide: REDIS_CLIENT, useValue: redisMock },
      ],
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
        AccessPermissionKey.OPERATIONS_TASKS_READ,
        AccessPermissionKey.OPERATIONS_TASKS_MANAGE,
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

  describe('listAssignedProfileNamesByUser()', () => {
    it('agrupa por usuario solo perfiles activos y compatibles con su rol base', async () => {
      const manager = {
        find: jest
          .fn()
          .mockResolvedValueOnce([
            { userId: 'user-1', profileId: 'profile-soporte' },
            { userId: 'user-1', profileId: 'profile-coord' },
            { userId: 'user-1', profileId: 'profile-noc' },
            { userId: 'user-2', profileId: 'profile-inactivo' },
          ])
          .mockResolvedValueOnce([
            {
              id: 'profile-soporte',
              name: 'Soporte nivel 2',
              baseRoleConstraint: UserRole.SUPPORT,
            },
            { id: 'profile-coord', name: 'Coordinación', baseRoleConstraint: UserRole.SUPPORT },
            { id: 'profile-noc', name: 'Monitoreo', baseRoleConstraint: UserRole.NOC },
          ]),
      };
      (runInTenantSchema as jest.Mock).mockImplementation(
        async (_ds, _schema, callback: (qr: { manager: typeof manager }) => unknown) =>
          callback({ manager }),
      );

      const result = await service.listAssignedProfileNamesByUser([
        { id: 'user-1', role: UserRole.SUPPORT },
        { id: 'user-2', role: UserRole.NOC },
      ]);

      expect(result.get('user-1')).toEqual(['Coordinación', 'Soporte nivel 2']);
      expect(result.has('user-2')).toBe(false);
      expect(manager.find).toHaveBeenCalledTimes(2);
    });

    it('no consulta la base si no hay usuarios', async () => {
      await expect(service.listAssignedProfileNamesByUser([])).resolves.toEqual(new Map());
      expect(runInTenantSchema).not.toHaveBeenCalled();
    });
  });
});
