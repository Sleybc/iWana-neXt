import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  AccessPermissionCatalog,
  AccessProfile,
  AccessProfilePermission,
  TenantContext,
  runInTenantSchema,
} from '@iwana/db';
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
    const existingCatalogRows = [
      {
        tenantId: 'tenant-test',
        permissionKey: AccessPermissionKey.SETTINGS_READ,
        moduleKey: 'settings',
        action: 'read',
        description: 'Ver centro de Configuración',
        catalogVersion: AccessPermissionCatalogVersion.MOD00_ACCESS_V1,
        availability: AccessPermissionAvailability.ASSIGNABLE,
        isSystem: true,
        isActive: false,
      },
    ];
    const catalogRows = [{ ...existingCatalogRows[0], isActive: true }];

    const manager = {
      find: jest.fn().mockResolvedValueOnce(existingCatalogRows).mockResolvedValueOnce(catalogRows),
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
    expect(manager.save).toHaveBeenCalledWith(
      AccessPermissionCatalog,
      expect.arrayContaining([
        expect.objectContaining({
          permissionKey: AccessPermissionKey.SETTINGS_READ,
          isActive: true,
        }),
      ]),
    );
    expect(result.version).toBe(AccessPermissionCatalogVersion.MOD00_ACCESS_V1);
    expect(result.permissions[0]?.isActive).toBe(true);
    expect(result.permissions).toEqual(catalogRows);
  });

  it('should exclude inactive profiles when listing profiles', async () => {
    const activeProfile = {
      id: 'profile-active',
      tenantId: 'tenant-test',
      name: 'Perfil activo',
      description: 'Perfil vigente.',
      baseRoleConstraint: UserRole.NOC,
      scopeSiteId: null,
      isSystem: false,
      isActive: true,
      createdAt: new Date('2026-05-25T00:00:00.000Z'),
      updatedAt: new Date('2026-05-25T00:00:00.000Z'),
    };
    const existingTemplates = [
      {
        id: 'template-admin',
        tenantId: 'tenant-test',
        name: 'Administrador general',
        description: 'Plantilla inicial para la administración general de la empresa.',
        baseRoleConstraint: UserRole.ADMIN,
        scopeSiteId: null,
        isSystem: true,
        isActive: true,
        createdAt: new Date('2026-05-25T00:00:00.000Z'),
        updatedAt: new Date('2026-05-25T00:00:00.000Z'),
      },
      {
        id: 'template-noc',
        tenantId: 'tenant-test',
        name: 'Monitoreo operativo',
        description: 'Plantilla inicial para monitoreo operativo.',
        baseRoleConstraint: UserRole.NOC,
        scopeSiteId: null,
        isSystem: true,
        isActive: true,
        createdAt: new Date('2026-05-25T00:00:00.000Z'),
        updatedAt: new Date('2026-05-25T00:00:00.000Z'),
      },
      {
        id: 'template-support',
        tenantId: 'tenant-test',
        name: 'Soporte inicial',
        description: 'Plantilla inicial para soporte operativo.',
        baseRoleConstraint: UserRole.SUPPORT,
        scopeSiteId: null,
        isSystem: true,
        isActive: true,
        createdAt: new Date('2026-05-25T00:00:00.000Z'),
        updatedAt: new Date('2026-05-25T00:00:00.000Z'),
      },
      {
        id: 'template-tech',
        tenantId: 'tenant-test',
        name: 'Técnico de campo',
        description: 'Plantilla inicial para agenda y ejecucion de trabajo de campo.',
        baseRoleConstraint: UserRole.TECHNICIAN,
        scopeSiteId: null,
        isSystem: true,
        isActive: true,
        createdAt: new Date('2026-05-25T00:00:00.000Z'),
        updatedAt: new Date('2026-05-25T00:00:00.000Z'),
      },
      {
        id: 'template-contractor',
        tenantId: 'tenant-test',
        name: 'Contratista',
        description: 'Plantilla inicial para operacion de campo limitada.',
        baseRoleConstraint: UserRole.CONTRACTOR,
        scopeSiteId: null,
        isSystem: true,
        isActive: true,
        createdAt: new Date('2026-05-25T00:00:00.000Z'),
        updatedAt: new Date('2026-05-25T00:00:00.000Z'),
      },
      {
        id: 'template-auditor',
        tenantId: 'tenant-test',
        name: 'Auditor',
        description: 'Plantilla inicial de consulta para auditoría.',
        baseRoleConstraint: UserRole.AUDITOR,
        scopeSiteId: null,
        isSystem: true,
        isActive: true,
        createdAt: new Date('2026-05-25T00:00:00.000Z'),
        updatedAt: new Date('2026-05-25T00:00:00.000Z'),
      },
    ];

    const manager = {
      find: jest.fn(async (entity: unknown, options?: { where?: Record<string, unknown> }) => {
        if (entity === AccessPermissionCatalog) {
          return Object.values(AccessPermissionKey).map((permissionKey) => ({
            tenantId: 'tenant-test',
            permissionKey,
            moduleKey: 'mock',
            action: 'mock',
            description: String(permissionKey),
            catalogVersion: AccessPermissionCatalogVersion.MOD00_ACCESS_V1,
            availability: AccessPermissionAvailability.ASSIGNABLE,
            isSystem: true,
            isActive: true,
          }));
        }

        if (entity === AccessProfile) {
          if (Array.isArray(options?.where) || (options?.where && 'name' in options.where)) {
            return existingTemplates;
          }

          if (options?.where && 'isActive' in options.where) {
            expect(options.where).toMatchObject({ tenantId: 'tenant-test', isActive: true });
            return [activeProfile];
          }

          return [activeProfile];
        }

        if (entity === AccessProfilePermission) {
          return [];
        }

        return [];
      }),
      create: jest.fn((_entity, value) => value),
      delete: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(
      async (
        _dataSource,
        _schemaName,
        callback: (queryRunner: { manager: typeof manager }) => unknown,
      ) => callback({ manager }),
    );

    const result = await service.listProfiles();

    expect(result).toEqual([
      expect.objectContaining({ id: 'profile-active', name: 'Perfil activo', isActive: true }),
    ]);
  });

  it('should seed system templates when listing profiles for a tenant without roles', async () => {
    const savedProfiles = [
      {
        id: 'template-admin',
        tenantId: 'tenant-test',
        name: 'Administrador general',
        description: 'Plantilla inicial para la administración general de la empresa.',
        baseRoleConstraint: UserRole.ADMIN,
        scopeSiteId: null,
        isSystem: true,
        isActive: true,
        createdAt: new Date('2026-05-25T00:00:00.000Z'),
        updatedAt: new Date('2026-05-25T00:00:00.000Z'),
      },
      {
        id: 'template-noc',
        tenantId: 'tenant-test',
        name: 'Monitoreo operativo',
        description: 'Plantilla inicial para monitoreo operativo.',
        baseRoleConstraint: UserRole.NOC,
        scopeSiteId: null,
        isSystem: true,
        isActive: true,
        createdAt: new Date('2026-05-25T00:00:00.000Z'),
        updatedAt: new Date('2026-05-25T00:00:00.000Z'),
      },
      {
        id: 'template-support',
        tenantId: 'tenant-test',
        name: 'Soporte inicial',
        description: 'Plantilla inicial para soporte operativo.',
        baseRoleConstraint: UserRole.SUPPORT,
        scopeSiteId: null,
        isSystem: true,
        isActive: true,
        createdAt: new Date('2026-05-25T00:00:00.000Z'),
        updatedAt: new Date('2026-05-25T00:00:00.000Z'),
      },
      {
        id: 'template-tech',
        tenantId: 'tenant-test',
        name: 'Técnico de campo',
        description: 'Plantilla inicial para agenda y ejecucion de trabajo de campo.',
        baseRoleConstraint: UserRole.TECHNICIAN,
        scopeSiteId: null,
        isSystem: true,
        isActive: true,
        createdAt: new Date('2026-05-25T00:00:00.000Z'),
        updatedAt: new Date('2026-05-25T00:00:00.000Z'),
      },
      {
        id: 'template-contractor',
        tenantId: 'tenant-test',
        name: 'Contratista',
        description: 'Plantilla inicial para operacion de campo limitada.',
        baseRoleConstraint: UserRole.CONTRACTOR,
        scopeSiteId: null,
        isSystem: true,
        isActive: true,
        createdAt: new Date('2026-05-25T00:00:00.000Z'),
        updatedAt: new Date('2026-05-25T00:00:00.000Z'),
      },
      {
        id: 'template-auditor',
        tenantId: 'tenant-test',
        name: 'Auditor',
        description: 'Plantilla inicial de consulta para auditoría.',
        baseRoleConstraint: UserRole.AUDITOR,
        scopeSiteId: null,
        isSystem: true,
        isActive: true,
        createdAt: new Date('2026-05-25T00:00:00.000Z'),
        updatedAt: new Date('2026-05-25T00:00:00.000Z'),
      },
    ];

    let profileReadCount = 0;
    const manager = {
      find: jest.fn(async (entity: unknown) => {
        if (entity === AccessPermissionCatalog) {
          return Object.values(AccessPermissionKey).map((permissionKey) => ({
            tenantId: 'tenant-test',
            permissionKey,
            moduleKey: 'mock',
            action: 'mock',
            description: String(permissionKey),
            catalogVersion: AccessPermissionCatalogVersion.MOD00_ACCESS_V1,
            availability: AccessPermissionAvailability.ASSIGNABLE,
            isSystem: true,
            isActive: true,
          }));
        }

        if (entity === AccessProfile) {
          profileReadCount += 1;
          return profileReadCount === 1 ? [] : savedProfiles;
        }

        if (entity === AccessProfilePermission) {
          return [];
        }

        return [];
      }),
      create: jest.fn((_entity, value) => value),
      delete: jest.fn().mockResolvedValue(undefined),
      save: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(savedProfiles)
        .mockResolvedValue(undefined),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(
      async (
        _dataSource,
        _schemaName,
        callback: (queryRunner: { manager: typeof manager }) => unknown,
      ) => callback({ manager }),
    );

    const result = await service.listProfiles();

    expect(manager.save).toHaveBeenNthCalledWith(
      2,
      AccessProfile,
      expect.arrayContaining([
        expect.objectContaining({ name: 'Administrador general', isSystem: true }),
        expect.objectContaining({ name: 'Monitoreo operativo', isSystem: true }),
        expect.objectContaining({ name: 'Soporte inicial', isSystem: true }),
        expect.objectContaining({ name: 'Técnico de campo', isSystem: true }),
        expect.objectContaining({ name: 'Contratista', isSystem: true }),
        expect.objectContaining({ name: 'Auditor', isSystem: true }),
      ]),
    );
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Administrador general', isSystem: true }),
        expect.objectContaining({ name: 'Monitoreo operativo', isSystem: true }),
        expect.objectContaining({ name: 'Soporte inicial', isSystem: true }),
        expect.objectContaining({ name: 'Técnico de campo', isSystem: true }),
        expect.objectContaining({ name: 'Contratista', isSystem: true }),
        expect.objectContaining({ name: 'Auditor', isSystem: true }),
      ]),
    );
  });

  it('should reactivate inactive system templates when listing profiles', async () => {
    const reactivatedTemplate = {
      id: 'template-admin',
      tenantId: 'tenant-test',
      name: 'Administrador general',
      description: 'descripcion vieja',
      baseRoleConstraint: UserRole.ADMIN,
      scopeSiteId: 'legacy-site',
      isSystem: false,
      isActive: false,
      createdAt: new Date('2026-05-25T00:00:00.000Z'),
      updatedAt: new Date('2026-05-25T00:00:00.000Z'),
    };
    const activeTemplates = [
      {
        id: 'template-noc',
        tenantId: 'tenant-test',
        name: 'Monitoreo operativo',
        description: 'Plantilla inicial para monitoreo operativo.',
        baseRoleConstraint: UserRole.NOC,
        scopeSiteId: null,
        isSystem: true,
        isActive: true,
        createdAt: new Date('2026-05-25T00:00:00.000Z'),
        updatedAt: new Date('2026-05-25T00:00:00.000Z'),
      },
      {
        id: 'template-support',
        tenantId: 'tenant-test',
        name: 'Soporte inicial',
        description: 'Plantilla inicial para soporte operativo.',
        baseRoleConstraint: UserRole.SUPPORT,
        scopeSiteId: null,
        isSystem: true,
        isActive: true,
        createdAt: new Date('2026-05-25T00:00:00.000Z'),
        updatedAt: new Date('2026-05-25T00:00:00.000Z'),
      },
      {
        id: 'template-tech',
        tenantId: 'tenant-test',
        name: 'Técnico de campo',
        description: 'Plantilla inicial para agenda y ejecucion de trabajo de campo.',
        baseRoleConstraint: UserRole.TECHNICIAN,
        scopeSiteId: null,
        isSystem: true,
        isActive: true,
        createdAt: new Date('2026-05-25T00:00:00.000Z'),
        updatedAt: new Date('2026-05-25T00:00:00.000Z'),
      },
      {
        id: 'template-contractor',
        tenantId: 'tenant-test',
        name: 'Contratista',
        description: 'Plantilla inicial para operacion de campo limitada.',
        baseRoleConstraint: UserRole.CONTRACTOR,
        scopeSiteId: null,
        isSystem: true,
        isActive: true,
        createdAt: new Date('2026-05-25T00:00:00.000Z'),
        updatedAt: new Date('2026-05-25T00:00:00.000Z'),
      },
      {
        id: 'template-auditor',
        tenantId: 'tenant-test',
        name: 'Auditor',
        description: 'Plantilla inicial de consulta para auditoría.',
        baseRoleConstraint: UserRole.AUDITOR,
        scopeSiteId: null,
        isSystem: true,
        isActive: true,
        createdAt: new Date('2026-05-25T00:00:00.000Z'),
        updatedAt: new Date('2026-05-25T00:00:00.000Z'),
      },
    ];
    const visibleProfiles = [
      {
        ...reactivatedTemplate,
        description: 'Plantilla inicial para la administración general de la empresa.',
        scopeSiteId: null,
        isSystem: true,
        isActive: true,
      },
      ...activeTemplates,
    ];

    const manager = {
      find: jest.fn(async (entity: unknown, options?: { where?: Record<string, unknown> }) => {
        if (entity === AccessPermissionCatalog) {
          return Object.values(AccessPermissionKey).map((permissionKey) => ({
            tenantId: 'tenant-test',
            permissionKey,
            moduleKey: 'mock',
            action: 'mock',
            description: String(permissionKey),
            catalogVersion: AccessPermissionCatalogVersion.MOD00_ACCESS_V1,
            availability: AccessPermissionAvailability.ASSIGNABLE,
            isSystem: true,
            isActive: true,
          }));
        }

        if (entity === AccessProfile) {
          if (Array.isArray(options?.where) || (options?.where && 'name' in options.where)) {
            return [reactivatedTemplate, ...activeTemplates];
          }

          if (options?.where && 'isActive' in options.where) {
            return visibleProfiles;
          }
        }

        if (entity === AccessProfilePermission) {
          return [];
        }

        return [];
      }),
      create: jest.fn((_entity, value) => value),
      delete: jest.fn().mockResolvedValue(undefined),
      save: jest.fn(async (entity, value) => {
        if (entity === AccessProfile) {
          return value;
        }

        return undefined;
      }),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(
      async (
        _dataSource,
        _schemaName,
        callback: (queryRunner: { manager: typeof manager }) => unknown,
      ) => callback({ manager }),
    );

    const result = await service.listProfiles();

    expect(manager.save).toHaveBeenCalledWith(
      AccessProfile,
      expect.arrayContaining([
        expect.objectContaining({
          id: 'template-admin',
          isSystem: true,
          isActive: true,
          description: 'Plantilla inicial para la administración general de la empresa.',
          scopeSiteId: null,
        }),
      ]),
    );
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'template-admin',
          isSystem: true,
          isActive: true,
        }),
      ]),
    );
  });

  it('should refresh active system templates when canonical copy changes', async () => {
    const staleTemplate = {
      id: 'template-admin',
      tenantId: 'tenant-test',
      name: 'Administrador general',
      description: 'Plantilla inicial de gobierno tenant.',
      baseRoleConstraint: UserRole.ADMIN,
      scopeSiteId: null,
      isSystem: true,
      isActive: true,
      createdAt: new Date('2026-05-25T00:00:00.000Z'),
      updatedAt: new Date('2026-05-25T00:00:00.000Z'),
    };

    const refreshedTemplate = {
      ...staleTemplate,
      description: 'Plantilla inicial para la administración general de la empresa.',
    };

    const manager = {
      find: jest.fn(async (entity: unknown, options?: { where?: Record<string, unknown> }) => {
        if (entity === AccessPermissionCatalog) {
          return Object.values(AccessPermissionKey).map((permissionKey) => ({
            tenantId: 'tenant-test',
            permissionKey,
            moduleKey: 'mock',
            action: 'mock',
            description: String(permissionKey),
            catalogVersion: AccessPermissionCatalogVersion.MOD00_ACCESS_V1,
            availability: AccessPermissionAvailability.ASSIGNABLE,
            isSystem: true,
            isActive: true,
          }));
        }

        if (entity === AccessProfile) {
          if (Array.isArray(options?.where) || (options?.where && 'name' in options.where)) {
            return [staleTemplate];
          }

          if (options?.where && 'isActive' in options.where) {
            return [refreshedTemplate];
          }
        }

        if (entity === AccessProfilePermission) {
          return [];
        }

        return [];
      }),
      create: jest.fn((_entity, value) => value),
      delete: jest.fn().mockResolvedValue(undefined),
      save: jest.fn(async (entity, value) => {
        if (entity === AccessProfile) {
          return value;
        }

        return undefined;
      }),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(
      async (
        _dataSource,
        _schemaName,
        callback: (queryRunner: { manager: typeof manager }) => unknown,
      ) => callback({ manager }),
    );

    const result = await service.listProfiles();

    expect(manager.save).toHaveBeenCalledWith(
      AccessProfile,
      expect.arrayContaining([
        expect.objectContaining({
          id: 'template-admin',
          description: 'Plantilla inicial para la administración general de la empresa.',
          isSystem: true,
          isActive: true,
        }),
      ]),
    );
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'template-admin',
          description: 'Plantilla inicial para la administración general de la empresa.',
        }),
      ]),
    );
  });

  it('should repair system template permissions even when the template row is already canonical', async () => {
    const timestamp = new Date('2026-05-25T00:00:00.000Z');
    const existingTemplates = [
      {
        id: 'template-admin',
        tenantId: 'tenant-test',
        name: 'Administrador general',
        description: 'Plantilla inicial para la administración general de la empresa.',
        baseRoleConstraint: UserRole.ADMIN,
        scopeSiteId: null,
        isSystem: true,
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'template-noc',
        tenantId: 'tenant-test',
        name: 'Monitoreo operativo',
        description: 'Plantilla inicial para monitoreo operativo.',
        baseRoleConstraint: UserRole.NOC,
        scopeSiteId: null,
        isSystem: true,
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'template-support',
        tenantId: 'tenant-test',
        name: 'Soporte inicial',
        description: 'Plantilla inicial para soporte operativo.',
        baseRoleConstraint: UserRole.SUPPORT,
        scopeSiteId: null,
        isSystem: true,
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'template-tech',
        tenantId: 'tenant-test',
        name: 'Técnico de campo',
        description: 'Plantilla inicial para agenda y ejecucion de trabajo de campo.',
        baseRoleConstraint: UserRole.TECHNICIAN,
        scopeSiteId: null,
        isSystem: true,
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'template-contractor',
        tenantId: 'tenant-test',
        name: 'Contratista',
        description: 'Plantilla inicial para operacion de campo limitada.',
        baseRoleConstraint: UserRole.CONTRACTOR,
        scopeSiteId: null,
        isSystem: true,
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'template-auditor',
        tenantId: 'tenant-test',
        name: 'Auditor',
        description: 'Plantilla inicial de consulta para auditoría.',
        baseRoleConstraint: UserRole.AUDITOR,
        scopeSiteId: null,
        isSystem: true,
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ];

    const manager = {
      find: jest.fn(
        async (
          entity: unknown,
          options?: { where?: Record<string, unknown> | Record<string, unknown>[] },
        ) => {
          if (entity === AccessPermissionCatalog) {
            return Object.values(AccessPermissionKey).map((permissionKey) => ({
              tenantId: 'tenant-test',
              permissionKey,
              moduleKey: 'mock',
              action: 'mock',
              description: String(permissionKey),
              catalogVersion: AccessPermissionCatalogVersion.MOD00_ACCESS_V1,
              availability: AccessPermissionAvailability.ASSIGNABLE,
              isSystem: true,
              isActive: true,
            }));
          }

          if (entity === AccessProfile) {
            return existingTemplates;
          }

          if (entity === AccessProfilePermission) {
            if (
              options?.where &&
              !Array.isArray(options.where) &&
              options.where.profileId === 'template-admin'
            ) {
              return [];
            }

            return [];
          }

          return [];
        },
      ),
      create: jest.fn((_entity, value) => value),
      delete: jest.fn().mockResolvedValue(undefined),
      save: jest.fn(async (_entity, value) => value),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(
      async (
        _dataSource,
        _schemaName,
        callback: (queryRunner: { manager: typeof manager }) => unknown,
      ) => callback({ manager }),
    );

    await service.listProfiles();

    expect(manager.delete).toHaveBeenCalledWith(AccessProfilePermission, {
      tenantId: 'tenant-test',
      profileId: 'template-admin',
    });
    expect(manager.save).toHaveBeenCalledWith(
      AccessProfilePermission,
      expect.arrayContaining([
        expect.objectContaining({
          tenantId: 'tenant-test',
          profileId: 'template-admin',
          permissionKey: AccessPermissionKey.SETTINGS_READ,
        }),
        expect.objectContaining({
          tenantId: 'tenant-test',
          profileId: 'template-admin',
          permissionKey: AccessPermissionKey.ACCESS_PROFILES_MANAGE,
        }),
      ]),
    );
  });

  it('should allow assignable permissions outside the base role baseline for custom profiles', async () => {
    const savedProfile = {
      id: 'profile-custom',
      tenantId: 'tenant-test',
      name: 'Perfil NOC ampliado',
      description: null,
      baseRoleConstraint: UserRole.NOC,
      scopeSiteId: null,
      isSystem: false,
      isActive: true,
      createdAt: new Date('2026-05-25T00:00:00.000Z'),
      updatedAt: new Date('2026-05-25T00:00:00.000Z'),
    };

    const manager = {
      find: jest.fn(async (entity: unknown, options?: { where?: Record<string, unknown> }) => {
        if (entity === AccessPermissionCatalog) {
          if (options?.where && 'permissionKey' in options.where) {
            return [
              {
                tenantId: 'tenant-test',
                permissionKey: AccessPermissionKey.USERS_MANAGE,
                moduleKey: 'users',
                action: 'manage',
                description: 'Crear, editar y desactivar usuarios internos',
                catalogVersion: AccessPermissionCatalogVersion.MOD00_ACCESS_V1,
                availability: AccessPermissionAvailability.ASSIGNABLE,
                isSystem: true,
                isActive: true,
              },
            ];
          }

          return [];
        }

        if (entity === AccessProfilePermission) {
          return [
            {
              tenantId: 'tenant-test',
              profileId: 'profile-custom',
              permissionKey: AccessPermissionKey.USERS_MANAGE,
            },
          ];
        }

        return [];
      }),
      save: jest.fn(async (entity, value) => {
        if (entity === AccessProfile) {
          return savedProfile;
        }

        return value;
      }),
      findOne: jest.fn(async (_entity, options?: { where?: Record<string, unknown> }) => {
        if (options?.where && 'name' in options.where) {
          return null;
        }

        return savedProfile;
      }),
      create: jest.fn((_entity, value) => value),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    (runInTenantSchema as jest.Mock).mockImplementation(
      async (
        _dataSource,
        _schemaName,
        callback: (queryRunner: { manager: typeof manager }) => unknown,
      ) => callback({ manager }),
    );

    const result = await service.createProfile({
      name: 'Perfil NOC ampliado',
      baseRoleConstraint: UserRole.NOC,
      permissionKeys: [AccessPermissionKey.USERS_MANAGE],
    });

    expect(result.permissions).toEqual([AccessPermissionKey.USERS_MANAGE]);
    expect(manager.delete).toHaveBeenCalledWith(AccessProfilePermission, {
      tenantId: 'tenant-test',
      profileId: 'profile-custom',
    });
  });

  it('should reject ACCESS_PROFILES_MANAGE for non-admin profiles', async () => {
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
      delete: jest.fn().mockResolvedValue(undefined),
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
        name: 'Perfil soporte sin gobierno',
        baseRoleConstraint: UserRole.SUPPORT,
        permissionKeys: [AccessPermissionKey.ACCESS_PROFILES_MANAGE],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should reject a reserved permission even for custom profiles', async () => {
    const manager = {
      find: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            permissionKey: AccessPermissionKey.ACCESS_PROFILES_MANAGE,
            availability: AccessPermissionAvailability.RESERVED,
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
