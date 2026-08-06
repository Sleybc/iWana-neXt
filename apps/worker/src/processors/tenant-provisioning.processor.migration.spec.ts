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

const mockGrantTenantSchemaAppPrivileges = jest.fn().mockResolvedValue(undefined);

jest.mock('@iwana/db', () => {
  const { resolveMigrationDbCredentials } = jest.requireActual(
    '../../../../packages/database/src/db-credentials',
  ) as typeof import('@iwana/db');

  return {
    Tenant: class Tenant {},
    TENANT_MIGRATIONS: [{ name: '000_initial' }, { name: '001_next' }],
    isValidSchemaName: jest.fn().mockReturnValue(true),
    applyTenantMigrationsInOrder: (...args: unknown[]) => mockApplyTenantMigrationsInOrder(...args),
    grantTenantSchemaAppPrivileges: (...args: unknown[]) =>
      mockGrantTenantSchemaAppPrivileges(...args),
    resolveMigrationDbCredentials,
    resolveAppDbRole: () =>
      (process.env['DB_APP_USER'] ?? process.env['DB_USER'] ?? 'iwana_app').trim(),
  };
});

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

    it('returns a signed int4-compatible number', () => {
      const processor = createProcessor();
      const hash = (processor as any).hashSchemaName('tenant_test');
      expect(hash).toBeGreaterThanOrEqual(-2147483648);
      expect(hash).toBeLessThanOrEqual(2147483647);
    });

    it('keeps large unsigned hashes inside PostgreSQL int4 range', () => {
      const processor = createProcessor();
      const hash = (processor as any).hashSchemaName('tenant_empresa_e2e_mcp_20260430_1153');
      expect(hash).toBeGreaterThanOrEqual(-2147483648);
      expect(hash).toBeLessThanOrEqual(2147483647);
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
    it('runs tenant migrations through the canonical ordered helper', async () => {
      mockPool.query.mockResolvedValue({ rows: [] }); // resolvePiiContractEnv: sin flota ACTIVE
      const processor = createProcessor();

      await expect(
        (processor as any).runMigrationsForSchema('tenant_isp_test'),
      ).resolves.toBeUndefined();

      expect(DataSource).toHaveBeenCalledWith(
        expect.objectContaining({
          schema: 'tenant_isp_test',
          extra: { options: '-c search_path="tenant_isp_test"' },
        }),
      );
      expect(mockApplyTenantMigrationsInOrder).toHaveBeenCalledTimes(1);
      expect(mockApplyTenantMigrationsInOrder).toHaveBeenCalledWith(expect.anything(), process.env);
    });
  });

  describe('resolvePiiContractEnv (N-1)', () => {
    it('fuerza el contract cuando alguna ACTIVE ya aplicó la 109', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ schema_name: 'tenant_isp_demo' }] })
        .mockResolvedValueOnce({ rows: [{ exists: true }] });

      const processor = createProcessor();
      const env = await (processor as any).resolvePiiContractEnv();

      expect(env.IWANA_APPLY_PII_CONTRACT).toBe('true');
    });

    it('fuerza el contract si solo un tenant posterior de la flota tiene la 109 (R2-2)', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ schema_name: 'tenant_a' }, { schema_name: 'tenant_b' }],
        })
        .mockResolvedValueOnce({ rows: [{ exists: false }] }) // tenant_a sin 109
        .mockResolvedValueOnce({ rows: [{ exists: true }] }); // tenant_b con 109

      const processor = createProcessor();
      const env = await (processor as any).resolvePiiContractEnv();

      expect(env.IWANA_APPLY_PII_CONTRACT).toBe('true');
    });

    it('no fuerza el contract si la flota aún está en ventana 1 (109 pendiente)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ schema_name: 'tenant_isp_demo' }] })
        .mockResolvedValueOnce({ rows: [{ exists: false }] });

      const processor = createProcessor();
      const env = await (processor as any).resolvePiiContractEnv();

      expect(env.IWANA_APPLY_PII_CONTRACT).toBeUndefined();
    });

    it('no fuerza el contract cuando no hay tenants ACTIVE (bootstrap)', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const processor = createProcessor();
      const env = await (processor as any).resolvePiiContractEnv();

      expect(env.IWANA_APPLY_PII_CONTRACT).toBeUndefined();
    });

    it('antepone el contract sin mutar el process.env real', async () => {
      const original = process.env.IWANA_APPLY_PII_CONTRACT;
      delete process.env.IWANA_APPLY_PII_CONTRACT;
      try {
        mockPool.query
          .mockResolvedValueOnce({ rows: [{ schema_name: 'tenant_isp_demo' }] })
          .mockResolvedValueOnce({ rows: [{ exists: true }] });

        const processor = createProcessor();
        const env = await (processor as any).resolvePiiContractEnv();

        expect(env.IWANA_APPLY_PII_CONTRACT).toBe('true');
        expect(process.env.IWANA_APPLY_PII_CONTRACT).toBeUndefined();
      } finally {
        if (original !== undefined) {
          process.env.IWANA_APPLY_PII_CONTRACT = original;
        }
      }
    });

    it('falla cerrado si la consulta de flota no responde (R2-1)', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('connection reset'));

      const processor = createProcessor();

      await expect((processor as any).resolvePiiContractEnv()).rejects.toThrow(/connection reset/);
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
