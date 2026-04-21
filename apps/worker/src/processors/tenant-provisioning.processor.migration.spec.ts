import * as fs from 'fs';
import { UnrecoverableError } from 'bullmq';
import { Pool } from 'pg';
import { DataSource } from 'typeorm';
import { TenantProvisioningProcessor } from './tenant-provisioning.processor';
import { TenantSeedService } from '../services/tenant-seed.service';

jest.mock('@nestjs/typeorm', () => ({
  InjectDataSource: () => () => undefined,
}));

jest.mock('typeorm', () => ({
  DataSource: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    runMigrations: jest.fn().mockResolvedValue([]),
    destroy: jest.fn().mockResolvedValue(undefined),
    isInitialized: true,
  })),
}));

jest.mock('@iwana/db', () => ({
  Tenant: class Tenant {},
  isValidSchemaName: jest.fn().mockReturnValue(true),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
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

function createProcessor(): TenantProvisioningProcessor {
  const updateBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  };

  const dataSource = {
    getRepository: jest.fn().mockReturnValue(buildTenantRepository()),
    createQueryBuilder: jest.fn().mockReturnValue(updateBuilder),
  } as unknown as DataSource;

  const tenantSeedService = {
    seedInitialAdmin: jest.fn().mockResolvedValue({ created: true }),
    seedTaxPresets: jest.fn().mockResolvedValue(undefined),
  } as unknown as TenantSeedService;

  return new TenantProvisioningProcessor(dataSource, tenantSeedService);
}

describe('TenantProvisioningProcessor - Migration Features', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('hashSchemaName', () => {
    it('returns same hash for same schema name (deterministic)', () => {
      const processor = createProcessor();
      const hash1 = (processor as any).hashSchemaName('tenant_isp_test');
      const hash2 = (processor as any).hashSchemaName('tenant_isp_test');
      expect(hash1).toBe(hash2);
    });

    it('returns different hashes for different schema names', () => {
      const processor = createProcessor();
      const hash1 = (processor as any).hashSchemaName('tenant_isp_test');
      const hash2 = (processor as any).hashSchemaName('tenant_acme');
      expect(hash1).not.toBe(hash2);
    });

    it('returns positive number', () => {
      const processor = createProcessor();
      const hash = (processor as any).hashSchemaName('tenant_test');
      expect(hash).toBeGreaterThan(0);
    });
  });

  describe('acquireTenantLock', () => {
    it('executes pg_advisory_lock with namespace 42 and resource', async () => {
      const processor = createProcessor();
      await (processor as any).acquireTenantLock(12345);
      expect(mockPool.query).toHaveBeenCalledWith('SELECT pg_advisory_lock($1, $2)', [42, 12345]);
    });
  });

  describe('releaseTenantLock', () => {
    it('executes pg_advisory_unlock with namespace 42 and resource', async () => {
      const processor = createProcessor();
      await (processor as any).releaseTenantLock(12345);
      expect(mockPool.query).toHaveBeenCalledWith('SELECT pg_advisory_unlock($1, $2)', [42, 12345]);
    });
  });

  describe('checkSchemaExists', () => {
    it('returns true when schema exists', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 1 });
      const processor = createProcessor();
      const exists = await (processor as any).checkSchemaExists('tenant_isp_test');
      expect(exists).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1',
        ['tenant_isp_test'],
      );
    });

    it('returns false when schema does not exist', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 0 });
      const processor = createProcessor();
      const exists = await (processor as any).checkSchemaExists('tenant_nonexistent');
      expect(exists).toBe(false);
    });
  });

  describe('runMigrationsForSchema', () => {
    it('runs migrations successfully for a schema', async () => {
      const processor = createProcessor();
      await expect(
        (processor as any).runMigrationsForSchema('tenant_isp_test'),
      ).resolves.toBeUndefined();
    });
  });

  describe('rollbackProvisioning', () => {
    it('drops schema and updates tenant status to FAILED', async () => {
      const updateBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      };

      const dataSource = {
        getRepository: jest.fn().mockReturnValue(buildTenantRepository()),
        createQueryBuilder: jest.fn().mockReturnValue(updateBuilder),
      } as unknown as DataSource;

      const tenantSeedService = {
        seedInitialAdmin: jest.fn(),
        seedTaxPresets: jest.fn(),
      } as unknown as TenantSeedService;

      const processor = new TenantProvisioningProcessor(dataSource, tenantSeedService);
      const error = new Error('Provisioning failed');

      await (processor as any).rollbackProvisioning('tenant_isp_test', 'tenant-uuid-1', error);

      expect(mockPool.query).toHaveBeenCalledWith(
        'DROP SCHEMA IF EXISTS "tenant_isp_test" CASCADE',
      );
      expect(updateBuilder.set).toHaveBeenCalledWith({
        status: 'PROVISIONING_FAILED',
        provisioning_error: 'Provisioning failed',
        provisioning_failed_at: expect.any(Function),
      });
      expect(updateBuilder.execute).toHaveBeenCalled();
    });
  });

  describe('process with migration integration', () => {
    it('acquires advisory lock per tenant', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 0 });
      mockClient.query.mockResolvedValue({ rowCount: 1 });

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

      (fs.readFileSync as jest.Mock).mockReturnValue(
        'BEGIN; CREATE SCHEMA IF NOT EXISTS "__SCHEMA_NAME__"; COMMIT;',
      );

      const processor = new TenantProvisioningProcessor(dataSource, tenantSeedService);

      await processor.process({
        data: {
          tenantId: 'tenant-uuid-1',
          schemaName: 'tenant_isp_test',
          tenantSlug: 'isp-test',
        },
      } as never);

      const lockCall = mockPool.query.mock.calls.find((call: any) =>
        call[0].includes('pg_advisory_lock'),
      );
      expect(lockCall).toBeDefined();
      expect(lockCall[1][0]).toBe(42);
    });

    it('calls checkSchemaExists before creating schema', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 0 });
      mockClient.query.mockResolvedValue({ rowCount: 1 });

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

      (fs.readFileSync as jest.Mock).mockReturnValue(
        'BEGIN; CREATE SCHEMA IF NOT EXISTS "__SCHEMA_NAME__"; COMMIT;',
      );

      const processor = new TenantProvisioningProcessor(dataSource, tenantSeedService);

      await processor.process({
        data: {
          tenantId: 'tenant-uuid-1',
          schemaName: 'tenant_isp_test',
          tenantSlug: 'isp-test',
        },
      } as never);

      const schemaCheckCall = mockPool.query.mock.calls.find((call: any) =>
        call[0].includes('information_schema.schemata'),
      );
      expect(schemaCheckCall).toBeDefined();
    });
  });
});
