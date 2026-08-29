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

describe('EffectivePermissionsService — caché Redis G1 (3)', () => {
  let service: EffectivePermissionsService;
  let redisMock: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let dataSourceMock: unknown;

  beforeEach(async () => {
    redisMock = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    dataSourceMock = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EffectivePermissionsService,
        { provide: getDataSourceToken(), useValue: dataSourceMock },
        { provide: REDIS_CLIENT, useValue: redisMock },
      ],
    }).compile();

    service = module.get(EffectivePermissionsService);

    (TenantContext.getOrThrow as jest.Mock).mockReturnValue({
      tenantId: 'tenant-1',
      schemaName: 'tenant_test',
    });
  });

  afterEach(() => jest.clearAllMocks());

  it('cachea permisos efectivos con TTL 60s y retorna del caché en hit', async () => {
    const cached = [AccessPermissionKey.SETTINGS_READ];
    // First call: miss -> compute
    const manager = {
      findOne: jest.fn().mockResolvedValue({ id: 'u1', tenantId: 'tenant-1', role: UserRole.NOC }),
      find: jest.fn().mockResolvedValue([]),
    };
    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, cb: any) =>
      cb({ manager }),
    );

    const first = await service.getEffectivePermissionsForUser('u1');
    expect(redisMock.get).toHaveBeenCalledWith('access:perms:tenant-1:u1');
    expect(redisMock.set).toHaveBeenCalledWith(
      'access:perms:tenant-1:u1',
      JSON.stringify(first),
      'EX',
      60,
    );

    // Second call: hit
    redisMock.get.mockResolvedValueOnce(JSON.stringify(cached));
    const second = await service.getEffectivePermissionsForUser('u1');
    expect(second).toEqual(cached);
    // No DB call on hit -> runInTenantSchema not called second time? We can assert get not called again
    // But our mock will still be called if we don't prevent; we check that second result came from cache
    expect(second).toEqual(cached);
  });

  it('fan-out por perfil invalida a usuarios con asignación activa', async () => {
    const manager = {
      find: jest.fn().mockResolvedValue([
        { userId: 'u1', profileId: 'p1', tenantId: 'tenant-1', isActive: true },
        { userId: 'u2', profileId: 'p1', tenantId: 'tenant-1', isActive: true },
      ]),
    };
    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, cb: any) =>
      cb({ manager }),
    );

    await service.invalidateByProfile('tenant-1', 'tenant_test', 'p1');

    expect(redisMock.del).toHaveBeenCalledWith(
      'access:perms:tenant-1:u1',
      'access:perms:tenant-1:u2',
    );
  });

  it('invalidateUserPermissions borra la clave del usuario', async () => {
    await service.invalidateUserPermissions('tenant-1', 'u42');
    expect(redisMock.del).toHaveBeenCalledWith('access:perms:tenant-1:u42');
  });

  it('degrade a BD cuando Redis falla en get (nunca deniega)', async () => {
    redisMock.get.mockRejectedValueOnce(new Error('Redis down'));
    const manager = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'u1', tenantId: 'tenant-1', role: UserRole.ADMIN }),
      find: jest.fn().mockResolvedValue([]),
    };
    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, cb: any) =>
      cb({ manager }),
    );

    const result = await service.getEffectivePermissionsForUser('u1');
    // ADMIN baseline should be returned even when cache fails
    expect(result).toEqual(expect.arrayContaining([AccessPermissionKey.SETTINGS_READ]));
    expect(redisMock.set).toHaveBeenCalled(); // try to set even after failure? It will try
  });

  it('degrade a BD cuando Redis falla en set (no propaga error)', async () => {
    redisMock.set.mockRejectedValueOnce(new Error('Redis down'));
    const manager = {
      findOne: jest.fn().mockResolvedValue({ id: 'u1', tenantId: 'tenant-1', role: UserRole.NOC }),
      find: jest.fn().mockResolvedValue([]),
    };
    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, cb: any) =>
      cb({ manager }),
    );

    await expect(service.getEffectivePermissionsForUser('u1')).resolves.toEqual([]);
  });

  it('scopedSiteId bypassa caché', async () => {
    const manager = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'u1', tenantId: 'tenant-1', role: UserRole.SUPPORT }),
      find: jest.fn().mockResolvedValue([]),
    };
    (runInTenantSchema as jest.Mock).mockImplementation(async (_ds, _schema, cb: any) =>
      cb({ manager }),
    );

    await service.getEffectivePermissionsForUser('u1', 'site-1');
    expect(redisMock.get).not.toHaveBeenCalled();
    expect(redisMock.set).not.toHaveBeenCalled();
  });
});
