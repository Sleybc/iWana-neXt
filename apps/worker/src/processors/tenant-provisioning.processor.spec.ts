// @ts-nocheck
import { UnrecoverableError } from 'bullmq';
import { Pool } from 'pg';
import { DataSource } from 'typeorm';
import { TenantProvisioningProcessor } from './tenant-provisioning.processor';
import { TenantSeedService } from '../services/tenant-seed.service';

jest.mock('@nestjs/typeorm', () => ({
  InjectDataSource: () => () => undefined,
}));

const mockApplyTenantMigrationsInOrder = jest.fn().mockResolvedValue(undefined);

jest.mock('typeorm', () => ({
  DataSource: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
    isInitialized: true,
  })),
}));

jest.mock('@iwana/db', () => ({
  Tenant: class Tenant {},
  TENANT_MIGRATIONS: [{ name: '000_initial' }, { name: '001_next' }],
  isValidSchemaName: jest.fn().mockReturnValue(true),
  applyTenantMigrationsInOrder: (...args: unknown[]) => mockApplyTenantMigrationsInOrder(...args),
}));

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockPool = {
  query: jest.fn(),
  connect: jest.fn().mockResolvedValue(mockClient),
  end: jest.fn(),
};

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => mockPool),
}));

function buildTenantRepository(contactEmail = 'admin@isptest.co') {
  return {
    findOne: jest.fn().mockResolvedValue({
      id: 'tenant-uuid-1',
      slug: 'isp-test',
      schemaName: 'tenant_isp_test',
      contactEmail,
    }),
  };
}

describe('TenantProvisioningProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('crea schema, ejecuta migraciones, siembra datos iniciales y activa el tenant', async () => {
    mockPool.query.mockResolvedValueOnce({ rowCount: 0 }).mockResolvedValueOnce({ rowCount: 0 });

    const tenantRepository = buildTenantRepository();
    const updateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = {
      getRepository: jest.fn().mockReturnValue(tenantRepository),
      createQueryBuilder: jest.fn().mockReturnValue(updateBuilder),
    } as unknown as DataSource;
    const tenantSeedService = {
      seedInitialAdmin: jest.fn().mockResolvedValue({ created: true }),
      seedTaxPresets: jest.fn().mockResolvedValue(undefined),
    } as unknown as TenantSeedService;

    const processor = new TenantProvisioningProcessor(dataSource, tenantSeedService);

    await processor.process({
      data: {
        tenantId: 'tenant-uuid-1',
        schemaName: 'tenant_isp_test',
        tenantSlug: 'isp-test',
      },
    } as never);

    expect(Pool).toHaveBeenCalledTimes(1);
    expect(mockPool.connect).toHaveBeenCalledTimes(1);
    expect(mockClient.query).toHaveBeenCalledWith('CREATE SCHEMA IF NOT EXISTS "tenant_isp_test"');
    expect(mockApplyTenantMigrationsInOrder).toHaveBeenCalledTimes(1);
    expect(DataSource).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: 'tenant_isp_test',
        extra: { options: '-c search_path="tenant_isp_test"' },
      }),
    );
    const migrationsCallOrder = mockApplyTenantMigrationsInOrder.mock.invocationCallOrder[0];
    const seedAdminCallOrder = (tenantSeedService.seedInitialAdmin as jest.Mock).mock
      .invocationCallOrder[0];
    expect(migrationsCallOrder).toBeDefined();
    expect(seedAdminCallOrder).toBeDefined();
    expect(migrationsCallOrder as number).toBeLessThan(seedAdminCallOrder as number);
    expect(tenantSeedService.seedInitialAdmin).toHaveBeenCalledWith({
      tenantId: 'tenant-uuid-1',
      tenantSlug: 'isp-test',
      schemaName: 'tenant_isp_test',
    });
    expect(tenantSeedService.seedTaxPresets).toHaveBeenCalledWith('tenant_isp_test');
    expect(updateBuilder.execute).toHaveBeenCalledTimes(1);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  // DEF-08: un schema preexistente no prueba que el tenant este provisionado.
  // El processor no debe activarlo sin verificar el estado real de migraciones.
  it('no activa el tenant cuando el schema existe pero las migraciones estan incompletas', async () => {
    mockPool.query
      // acquireTenantLock
      .mockResolvedValueOnce({ rowCount: 0 })
      // checkSchemaExists -> el schema YA existe
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ schema_name: 'tenant_isp_test' }] })
      // checkTenantMigrationsComplete -> la tabla typeorm_migrations no existe
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '0' }] });

    const tenantRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'tenant-uuid-1',
        slug: 'isp-test',
        schemaName: 'tenant_isp_test',
        status: 'PROVISIONING',
      }),
    };
    const updateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = {
      getRepository: jest.fn().mockReturnValue(tenantRepository),
      createQueryBuilder: jest.fn().mockReturnValue(updateBuilder),
    } as unknown as DataSource;
    const tenantSeedService = {
      seedInitialAdmin: jest.fn().mockResolvedValue({ created: true }),
      seedTaxPresets: jest.fn().mockResolvedValue(undefined),
    } as unknown as TenantSeedService;

    const processor = new TenantProvisioningProcessor(dataSource, tenantSeedService);

    await processor.process({
      data: {
        tenantId: 'tenant-uuid-1',
        schemaName: 'tenant_isp_test',
        tenantSlug: 'isp-test',
      },
    } as never);

    // El tenant no puede quedar ACTIVE sin haber migrado y sembrado el schema.
    expect(mockApplyTenantMigrationsInOrder).toHaveBeenCalledTimes(1);
    expect(tenantSeedService.seedInitialAdmin).toHaveBeenCalledWith({
      tenantId: 'tenant-uuid-1',
      tenantSlug: 'isp-test',
      schemaName: 'tenant_isp_test',
    });
    expect(tenantSeedService.seedTaxPresets).toHaveBeenCalledWith('tenant_isp_test');

    // Y la activacion debe ocurrir DESPUES de migrar, no antes.
    const migrationsOrder = mockApplyTenantMigrationsInOrder.mock.invocationCallOrder[0] as number;
    const activationOrder = updateBuilder.execute.mock.invocationCallOrder[0] as number;
    expect(migrationsOrder).toBeLessThan(activationOrder);
  });

  // DEF-08: un schema ya migrado por completo si permite la recuperacion
  // idempotente (job que murio despues de migrar, antes de fijar el status).
  it('activa sin re-migrar cuando el schema existe con todas las migraciones aplicadas', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ schema_name: 'tenant_isp_test' }] })
      // typeorm_migrations existe
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '1' }] })
      // ...con todas las migraciones aplicadas (mock TENANT_MIGRATIONS = 2)
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '2' }] });

    const tenantRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'tenant-uuid-1',
        slug: 'isp-test',
        schemaName: 'tenant_isp_test',
        status: 'PROVISIONING',
      }),
    };
    const updateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = {
      getRepository: jest.fn().mockReturnValue(tenantRepository),
      createQueryBuilder: jest.fn().mockReturnValue(updateBuilder),
    } as unknown as DataSource;
    const tenantSeedService = {
      seedInitialAdmin: jest.fn(),
      seedTaxPresets: jest.fn(),
    } as unknown as TenantSeedService;

    const processor = new TenantProvisioningProcessor(dataSource, tenantSeedService);

    await processor.process({
      data: {
        tenantId: 'tenant-uuid-1',
        schemaName: 'tenant_isp_test',
        tenantSlug: 'isp-test',
      },
    } as never);

    expect(mockApplyTenantMigrationsInOrder).not.toHaveBeenCalled();
    expect(updateBuilder.set).toHaveBeenCalledWith({ status: 'ACTIVE' });
  });

  it('marca como fallo permanente cuando el tenant no existe y no debe reintentarse', async () => {
    mockPool.query.mockResolvedValueOnce({ rowCount: 0 }).mockResolvedValueOnce({ rowCount: 0 });

    const tenantRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const updateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = {
      getRepository: jest.fn().mockReturnValue(tenantRepository),
      createQueryBuilder: jest.fn().mockReturnValue(updateBuilder),
    } as unknown as DataSource;
    const tenantSeedService = {
      seedInitialAdmin: jest.fn(),
      seedTaxPresets: jest.fn(),
    } as unknown as TenantSeedService;

    const processor = new TenantProvisioningProcessor(dataSource, tenantSeedService);

    await expect(
      processor.process({
        data: {
          tenantId: 'tenant-missing',
          schemaName: 'tenant_missing',
          tenantSlug: 'missing',
        },
      } as never),
    ).rejects.toBeInstanceOf(UnrecoverableError);

    expect(updateBuilder.execute).toHaveBeenCalledTimes(1);
    expect(mockPool.connect).not.toHaveBeenCalled();
    expect(tenantSeedService.seedInitialAdmin).not.toHaveBeenCalled();
  });
});
