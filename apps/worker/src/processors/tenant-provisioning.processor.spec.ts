import { UnrecoverableError } from 'bullmq';
import { Pool } from 'pg';
import { DataSource } from 'typeorm';
import { TenantProvisioningProcessor } from './tenant-provisioning.processor';
import { TenantSeedService } from '../services/tenant-seed.service';

jest.mock('@nestjs/typeorm', () => ({
  InjectDataSource: () => () => undefined,
}));

const mockRunMigrations = jest.fn().mockResolvedValue([]);

jest.mock('typeorm', () => ({
  DataSource: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    runMigrations: mockRunMigrations,
    destroy: jest.fn().mockResolvedValue(undefined),
    isInitialized: true,
  })),
}));

jest.mock('@iwana/db', () => ({
  Tenant: class Tenant {},
  isValidSchemaName: jest.fn().mockReturnValue(true),
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

class MockTenantMigration {
  async up(): Promise<void> {}
  async down(): Promise<void> {}
}

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
    (processor as any).loadTenantMigrationClasses = jest
      .fn()
      .mockResolvedValue([MockTenantMigration]);

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
    expect(mockRunMigrations).toHaveBeenCalledTimes(1);
    const migrationsCallOrder = mockRunMigrations.mock.invocationCallOrder[0];
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
