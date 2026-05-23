import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import {
  AccessPermissionAvailability,
  AccessPermissionCatalogVersion,
  AccessPermissionKey,
  UserRole,
} from '@iwana/shared';
import { AuditService } from '../audit/audit.service';
import { AccessControlService } from './access-control.service';
import { AccessGovernanceService } from './services/access-governance.service';

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db');
  return {
    ...actual,
    TenantContext: { getOrThrow: jest.fn() },
    runInTenantSchema: jest.fn(),
  };
});

describe('AccessControlService', () => {
  let service: AccessControlService;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AccessControlService,
        { provide: getDataSourceToken(), useValue: {} },
        { provide: AuditService, useValue: { log: jest.fn() } },
        {
          provide: AccessGovernanceService,
          useValue: {
            assertUserProfilesMutationAllowed: jest.fn(),
            assertProfileMutationAllowed: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AccessControlService);

    (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
      tenantId: 'tenant-test',
      schemaName: 'tenant_test',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should seed MOD00_ACCESS_V1 idempotently when listing permissions', async () => {
    const catalogRows = [
      {
        tenantId: 'tenant-test',
        permissionKey: AccessPermissionKey.SETTINGS_READ,
        moduleKey: 'settings',
        action: 'read',
        description: 'Ver centro de Configuración',
        catalogVersion: AccessPermissionCatalogVersion.MOD00_ACCESS_V1,
        availability: AccessPermissionAvailability.ASSIGNABLE,
        isSystem: true,
        isActive: true,
      },
    ];

    const manager = {
      find: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(catalogRows),
      create: jest.fn((_entity, value) => value),
      save: jest.fn().mockResolvedValue(undefined),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(
      async (
        _dataSource,
        _schemaName,
        callback: (queryRunner: { manager: typeof manager }) => unknown,
      ) => callback({ manager }),
    );

    const result = await service.listPermissions();

    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(result.version).toBe(AccessPermissionCatalogVersion.MOD00_ACCESS_V1);
    expect(result.permissions).toEqual(catalogRows);
  });

  it('should reject a permission incompatible with the profile base role', async () => {
    const manager = {
      find: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            permissionKey: AccessPermissionKey.ACCESS_PROFILES_MANAGE,
            availability: AccessPermissionAvailability.ASSIGNABLE,
          },
        ]),
      save: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((_entity, value) => value),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(
      async (
        _dataSource,
        _schemaName,
        callback: (queryRunner: { manager: typeof manager }) => unknown,
      ) => callback({ manager }),
    );

    await expect(
      service.createProfile({
        name: 'Perfil NOC inválido',
        baseRoleConstraint: UserRole.NOC,
        permissionKeys: [AccessPermissionKey.ACCESS_PROFILES_MANAGE],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should include full admin baseline in effective permissions summary', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-admin',
        tenantId: 'tenant-test',
        role: UserRole.ADMIN,
      }),
      find: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(
      async (
        _dataSource,
        _schemaName,
        callback: (queryRunner: { manager: typeof manager }) => unknown,
      ) => callback({ manager }),
    );

    const result = await service.getEffectivePermissionsSummary('user-admin');

    expect(result.role).toBe(UserRole.ADMIN);
    expect(result.effectivePermissions).toEqual(
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
    expect(result.recoveryPermissions).toEqual(
      expect.arrayContaining([
        AccessPermissionKey.ACCESS_PROFILES_MANAGE,
        AccessPermissionKey.ACCESS_ASSIGNMENTS_MANAGE,
        AccessPermissionKey.ORGANIZATION_SITES_MANAGE,
      ]),
    );
  });
});
