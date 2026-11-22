// @ts-nocheck
import { Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { isValidSchemaName } from '@iwana/db';
import { Pool } from 'pg';
import { DataSource } from 'typeorm';
import { TenantProvisioningProcessor } from './tenant-provisioning.processor';
import { TenantSeedService } from '../services/tenant-seed.service';

jest.mock('@nestjs/typeorm', () => ({
  InjectDataSource: () => () => undefined,
}));

const mockApplyTenantMigrationsInOrder = jest.fn().mockResolvedValue(undefined);
const mockGrantTenantSchemaAppPrivileges = jest.fn().mockResolvedValue(undefined);

jest.mock('typeorm', () => ({
  DataSource: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
    isInitialized: true,
  })),
}));

jest.mock('@iwana/db', () => {
  const { resolveMigrationDbCredentials } = jest.requireActual(
    '../../../../packages/database/src/db-credentials',
  ) as typeof import('@iwana/db');

  // F2-D2: la auditoría de la transición es la real (forma de la fila), sobre el doble del manager.
  const tenantStatusAudit = jest.requireActual(
    '../../../../packages/database/src/tenant-status-audit',
  ) as typeof import('@iwana/db');

  return {
    buildTenantStatusTransitionAudit: tenantStatusAudit.buildTenantStatusTransitionAudit,
    insertTenantStatusTransitionAudit: tenantStatusAudit.insertTenantStatusTransitionAudit,
    Tenant: class Tenant {},
    TENANT_MIGRATIONS: [{ name: '000_initial' }, { name: '001_next' }],
    isValidSchemaName: jest.fn().mockReturnValue(true),
    applyTenantMigrationsInOrder: (...args: unknown[]) => mockApplyTenantMigrationsInOrder(...args),
    grantTenantSchemaAppPrivileges: (...args: unknown[]) =>
      mockGrantTenantSchemaAppPrivileges(...args),
    // DT-4: el resumen real conserva el `code=` de dominio (TENANT_NOT_PROVISIONABLE)
    // que el doble anterior descartaba; para errores sin code produce lo mismo.
    summarizeErrorForLog: jest.requireActual(
      '../../../../packages/database/src/summarize-error-for-log',
    ).summarizeErrorForLog,
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

function buildTenantRepository(
  contactEmail = 'admin@isptest.co',
  adminEmail: string | null = 'admin@isptest.invalid',
) {
  return {
    findOne: jest.fn().mockResolvedValue({
      id: 'tenant-uuid-1',
      slug: 'isp-test',
      schemaName: 'tenant_isp_test',
      // DT-4: el procesador solo aprovisiona tenants en PROVISIONING.
      status: 'PROVISIONING',
      contactEmail,
      // sec-eng C-2: el email del administrador sale de la fila, no del payload.
      adminEmail,
    }),
  };
}

describe('TenantProvisioningProcessor', () => {
  const envKeys = ['DB_USER', 'DB_PASSWORD', 'DB_MIGRATOR_USER', 'DB_MIGRATOR_PASSWORD'] as const;
  const envSnapshot: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      envSnapshot[key] = process.env[key];
    }
    mockGrantTenantSchemaAppPrivileges.mockResolvedValue(undefined);
    mockApplyTenantMigrationsInOrder.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
    for (const key of envKeys) {
      const previous = envSnapshot[key];
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    }
  });

  it('usa DB_USER en el pool DDL cuando DB_MIGRATOR_USER no está definido', () => {
    delete process.env['DB_MIGRATOR_USER'];
    delete process.env['DB_MIGRATOR_PASSWORD'];
    process.env['DB_USER'] = 'iwana';
    process.env['DB_PASSWORD'] = 'dev-pass';

    const dataSource = {
      getRepository: jest.fn(),
      createQueryBuilder: jest.fn(),
      // F2-D2: el cambio de estado y su auditoría van en una transacción sobre el mismo doble.
      transaction: jest.fn(async function (this: unknown, work: (manager: unknown) => unknown) {
        return work(this);
      }),
      query: jest.fn().mockResolvedValue([]),
    } as unknown as DataSource;
    const tenantSeedService = {
      seedInitialAdmin: jest.fn(),
      seedTaxPresets: jest.fn(),
    } as unknown as TenantSeedService;

    new TenantProvisioningProcessor(dataSource, tenantSeedService);

    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'iwana',
        password: 'dev-pass',
      }),
    );
  });

  it('usa DB_MIGRATOR_USER en el pool DDL cuando está definido', () => {
    process.env['DB_USER'] = 'iwana_app';
    process.env['DB_PASSWORD'] = 'app-pass';
    process.env['DB_MIGRATOR_USER'] = 'iwana_migrator';
    process.env['DB_MIGRATOR_PASSWORD'] = 'migrator-pass';

    const dataSource = {
      getRepository: jest.fn(),
      createQueryBuilder: jest.fn(),
      // F2-D2: el cambio de estado y su auditoría van en una transacción sobre el mismo doble.
      transaction: jest.fn(async function (this: unknown, work: (manager: unknown) => unknown) {
        return work(this);
      }),
      query: jest.fn().mockResolvedValue([]),
    } as unknown as DataSource;
    const tenantSeedService = {
      seedInitialAdmin: jest.fn(),
      seedTaxPresets: jest.fn(),
    } as unknown as TenantSeedService;

    new TenantProvisioningProcessor(dataSource, tenantSeedService);

    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'iwana_migrator',
        password: 'migrator-pass',
      }),
    );
  });

  it('crea schema, ejecuta migraciones, otorga grants SEC-04, siembra y activa el tenant', async () => {
    process.env['DB_USER'] = 'iwana_app';
    process.env['DB_MIGRATOR_USER'] = 'iwana_migrator';
    process.env['DB_MIGRATOR_PASSWORD'] = 'migrator-pass';
    mockPool.query.mockResolvedValue({ rowCount: 0 });

    const tenantRepository = buildTenantRepository();
    const updateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      // DT-4: el UPDATE condicional exige que la fila siga en PROVISIONING.
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const dataSource = {
      getRepository: jest.fn().mockReturnValue(tenantRepository),
      createQueryBuilder: jest.fn().mockReturnValue(updateBuilder),
      // F2-D2: el cambio de estado y su auditoría van en una transacción sobre el mismo doble.
      transaction: jest.fn(async function (this: unknown, work: (manager: unknown) => unknown) {
        return work(this);
      }),
      query: jest.fn().mockResolvedValue([]),
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
    expect(mockGrantTenantSchemaAppPrivileges).toHaveBeenCalledWith(
      mockPool,
      'tenant_isp_test',
      expect.objectContaining({ appRole: 'iwana_app', migratorRole: 'iwana_migrator' }),
    );
    expect(DataSource).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: 'tenant_isp_test',
        extra: { options: '-c search_path="tenant_isp_test"' },
      }),
    );
    const migrationsCallOrder = mockApplyTenantMigrationsInOrder.mock.invocationCallOrder[0];
    const grantCallOrder = mockGrantTenantSchemaAppPrivileges.mock.invocationCallOrder[0];
    const seedAdminCallOrder = (tenantSeedService.seedInitialAdmin as jest.Mock).mock
      .invocationCallOrder[0];
    expect(migrationsCallOrder).toBeDefined();
    expect(grantCallOrder).toBeDefined();
    expect(seedAdminCallOrder).toBeDefined();
    expect(migrationsCallOrder as number).toBeLessThan(grantCallOrder as number);
    expect(grantCallOrder as number).toBeLessThan(seedAdminCallOrder as number);
    expect(tenantSeedService.seedInitialAdmin).toHaveBeenCalledWith({
      tenantId: 'tenant-uuid-1',
      tenantSlug: 'isp-test',
      schemaName: 'tenant_isp_test',
      adminEmail: 'admin@isptest.invalid',
    });
    expect(tenantSeedService.seedTaxPresets).toHaveBeenCalledWith('tenant_isp_test');
    expect(updateBuilder.execute).toHaveBeenCalledTimes(1);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('F4-D1: al activar encola una medición de uso; si encolar falla, la activación sigue', async () => {
    mockPool.query.mockResolvedValue({ rowCount: 0 });
    const updateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const dataSource = {
      getRepository: jest.fn().mockReturnValue(buildTenantRepository()),
      createQueryBuilder: jest.fn().mockReturnValue(updateBuilder),
      // F2-D2: el cambio de estado y su auditoría van en una transacción sobre el mismo doble.
      transaction: jest.fn(async function (this: unknown, work: (manager: unknown) => unknown) {
        return work(this);
      }),
      query: jest.fn().mockResolvedValue([]),
    } as unknown as DataSource;
    const tenantSeedService = {
      seedInitialAdmin: jest.fn().mockResolvedValue({ created: true }),
      seedTaxPresets: jest.fn().mockResolvedValue(undefined),
    } as unknown as TenantSeedService;
    const usageQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const job = {
      data: { tenantId: 'tenant-uuid-1', schemaName: 'tenant_isp_test', tenantSlug: 'isp-test' },
    } as never;

    const processor = new TenantProvisioningProcessor(
      dataSource,
      tenantSeedService,
      usageQueue as never,
    );
    await processor.process(job);
    // ADR-114 D2: el payload lleva la empresa activada para medir solo esa.
    expect(usageQueue.add).toHaveBeenCalledWith(
      'sample',
      { tenantId: 'tenant-uuid-1' },
      expect.objectContaining({ jobId: 'usage-on-activate-tenant-uuid-1' }),
    );

    usageQueue.add.mockRejectedValueOnce(new Error('redis caído'));
    await expect(processor.process(job)).resolves.toBeUndefined();

    // Sin activación (el estado cambió durante la puesta en marcha) no se encola.
    usageQueue.add.mockClear();
    updateBuilder.execute.mockResolvedValueOnce({ affected: 0 });
    await processor.process(job);
    expect(usageQueue.add).not.toHaveBeenCalled();
  });

  describe('sec-eng C-2: email del administrador desde la fila, no desde la cola', () => {
    function buildWith(adminEmail: string | null) {
      const updateBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const dataSource = {
        getRepository: jest
          .fn()
          .mockReturnValue(buildTenantRepository('contacto@isptest.co', adminEmail)),
        createQueryBuilder: jest.fn().mockReturnValue(updateBuilder),
        query: jest.fn().mockResolvedValue([]),
        transaction: jest.fn(async function (this: unknown, work: (manager: unknown) => unknown) {
          return work(this);
        }),
      };
      const seed = {
        seedInitialAdmin: jest.fn().mockResolvedValue({ created: true }),
        seedTaxPresets: jest.fn().mockResolvedValue(undefined),
      };
      return {
        processor: new TenantProvisioningProcessor(dataSource as never, seed as never),
        seed,
      };
    }
    const job = {
      data: { tenantId: 'tenant-uuid-1', schemaName: 'tenant_isp_test', tenantSlug: 'isp-test' },
    } as never;

    it('siembra el ADMIN con tenants.admin_email', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 0 });
      const { processor, seed } = buildWith('admin@fila.invalid');
      await processor.process(job);
      expect(seed.seedInitialAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ adminEmail: 'admin@fila.invalid' }),
      );
    });

    it('una empresa anterior al campo conserva el email del seed antiguo', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 0 });
      const { processor, seed } = buildWith(null);
      await processor.process(job);
      expect(seed.seedInitialAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ adminEmail: 'admin@iwana.co' }),
      );
    });
  });

  describe('F2-D2: auditoría de la transición de estado', () => {
    function buildDataSource(affected: number) {
      const updateBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected }),
      };
      const manager = {
        createQueryBuilder: jest.fn().mockReturnValue(updateBuilder),
        query: jest.fn().mockResolvedValue([]),
      };
      const dataSource = {
        getRepository: jest.fn().mockReturnValue(buildTenantRepository()),
        createQueryBuilder: jest.fn(),
        query: jest.fn(),
        transaction: jest.fn(async (work: (m: unknown) => unknown) => work(manager)),
      };
      return { dataSource, manager, updateBuilder };
    }
    const job = {
      data: { tenantId: 'tenant-uuid-1', schemaName: 'tenant_isp_test', tenantSlug: 'isp-test' },
    } as never;
    const seed = () =>
      ({
        seedInitialAdmin: jest.fn().mockResolvedValue({ created: true }),
        seedTaxPresets: jest.fn().mockResolvedValue(undefined),
      }) as unknown as TenantSeedService;

    function auditCall(manager: { query: jest.Mock }) {
      return manager.query.mock.calls.find(([sql]) =>
        String(sql).includes('INSERT INTO public.platform_audit_logs'),
      );
    }

    it('la activación escribe UPDATE de Tenant con new_value.status ACTIVE en la misma transacción', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 0 });
      const { dataSource, manager, updateBuilder } = buildDataSource(1);

      await new TenantProvisioningProcessor(dataSource as never, seed()).process(job);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(updateBuilder.set).toHaveBeenCalledWith({ status: 'ACTIVE' });
      const call = auditCall(manager);
      expect(call?.[1]).toEqual([
        'UPDATE',
        'Tenant',
        'tenant-uuid-1',
        JSON.stringify({ status: 'PROVISIONING' }),
        JSON.stringify({ status: 'ACTIVE', actor: 'worker:tenant-provisioning' }),
        'worker:tenant-provisioning',
      ]);
      // Primero el cambio de estado, después su auditoría, sobre el mismo manager.
      expect(updateBuilder.execute.mock.invocationCallOrder[0]).toBeLessThan(
        manager.query.mock.invocationCallOrder[0] as number,
      );
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('el fallo del aprovisionamiento audita el paso a PROVISIONING_FAILED', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 0 });
      mockApplyTenantMigrationsInOrder.mockRejectedValueOnce(new Error('migración rota'));
      const { dataSource, manager, updateBuilder } = buildDataSource(1);

      await expect(
        new TenantProvisioningProcessor(dataSource as never, seed()).process(job),
      ).rejects.toBeDefined();

      expect(updateBuilder.set).toHaveBeenCalledWith({ status: 'PROVISIONING_FAILED' });
      const newValue = JSON.parse(String(auditCall(manager)?.[1]?.[4]));
      expect(newValue).toEqual({
        status: 'PROVISIONING_FAILED',
        actor: 'worker:tenant-provisioning',
      });
    });

    it('sin fila cambiada (el estado ya no era PROVISIONING) no audita nada', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 0 });
      const { dataSource, manager } = buildDataSource(0);

      await new TenantProvisioningProcessor(dataSource as never, seed()).process(job);

      expect(auditCall(manager)).toBeUndefined();
    });
  });

  it('aborta el provisioning si falla el GRANT SEC-04 (no siembra a ciegas)', async () => {
    process.env['DB_USER'] = 'iwana_app';
    process.env['DB_MIGRATOR_USER'] = 'iwana_migrator';
    mockPool.query.mockResolvedValue({ rowCount: 0 });
    mockGrantTenantSchemaAppPrivileges.mockRejectedValueOnce(new Error('rol app ausente'));

    const tenantRepository = buildTenantRepository();
    const updateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      // DT-4: el UPDATE condicional exige que la fila siga en PROVISIONING.
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const dataSource = {
      getRepository: jest.fn().mockReturnValue(tenantRepository),
      createQueryBuilder: jest.fn().mockReturnValue(updateBuilder),
      // F2-D2: el cambio de estado y su auditoría van en una transacción sobre el mismo doble.
      transaction: jest.fn(async function (this: unknown, work: (manager: unknown) => unknown) {
        return work(this);
      }),
      query: jest.fn().mockResolvedValue([]),
    } as unknown as DataSource;
    const tenantSeedService = {
      seedInitialAdmin: jest.fn(),
      seedTaxPresets: jest.fn(),
    } as unknown as TenantSeedService;

    const processor = new TenantProvisioningProcessor(dataSource, tenantSeedService);

    await expect(
      processor.process({
        data: {
          tenantId: 'tenant-uuid-1',
          schemaName: 'tenant_isp_test',
          tenantSlug: 'isp-test',
        },
      } as never),
    ).rejects.toMatchObject({ message: 'class=Error sqlstate=none' });

    expect(tenantSeedService.seedInitialAdmin).not.toHaveBeenCalled();
    expect(tenantSeedService.seedTaxPresets).not.toHaveBeenCalled();
    expect(updateBuilder.set).toHaveBeenCalledWith({ status: 'PROVISIONING_FAILED' });
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
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '0' }] })
      // releaseTenantLock (+ cualquier query residual)
      .mockResolvedValue({ rowCount: 0 });

    const tenantRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'tenant-uuid-1',
        slug: 'isp-test',
        schemaName: 'tenant_isp_test',
        status: 'PROVISIONING',
        adminEmail: 'admin@isptest.invalid',
      }),
    };
    const updateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      // DT-4: el UPDATE condicional exige que la fila siga en PROVISIONING.
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const dataSource = {
      getRepository: jest.fn().mockReturnValue(tenantRepository),
      createQueryBuilder: jest.fn().mockReturnValue(updateBuilder),
      // F2-D2: el cambio de estado y su auditoría van en una transacción sobre el mismo doble.
      transaction: jest.fn(async function (this: unknown, work: (manager: unknown) => unknown) {
        return work(this);
      }),
      query: jest.fn().mockResolvedValue([]),
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

    // El tenant no puede quedar ACTIVE sin haber migrado, otorgado grants y sembrado.
    expect(mockApplyTenantMigrationsInOrder).toHaveBeenCalledTimes(1);
    expect(mockGrantTenantSchemaAppPrivileges).toHaveBeenCalledTimes(1);
    expect(tenantSeedService.seedInitialAdmin).toHaveBeenCalledWith({
      tenantId: 'tenant-uuid-1',
      tenantSlug: 'isp-test',
      schemaName: 'tenant_isp_test',
      adminEmail: 'admin@isptest.invalid',
    });
    expect(tenantSeedService.seedTaxPresets).toHaveBeenCalledWith('tenant_isp_test');

    // Y la activacion debe ocurrir DESPUES de migrar + GRANT, no antes.
    const migrationsOrder = mockApplyTenantMigrationsInOrder.mock.invocationCallOrder[0] as number;
    const grantOrder = mockGrantTenantSchemaAppPrivileges.mock.invocationCallOrder[0] as number;
    const activationOrder = updateBuilder.execute.mock.invocationCallOrder[0] as number;
    expect(migrationsOrder).toBeLessThan(grantOrder);
    expect(grantOrder).toBeLessThan(activationOrder);
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
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '2' }] })
      .mockResolvedValue({ rowCount: 0 });

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
      // DT-4: el UPDATE condicional exige que la fila siga en PROVISIONING.
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const dataSource = {
      getRepository: jest.fn().mockReturnValue(tenantRepository),
      createQueryBuilder: jest.fn().mockReturnValue(updateBuilder),
      // F2-D2: el cambio de estado y su auditoría van en una transacción sobre el mismo doble.
      transaction: jest.fn(async function (this: unknown, work: (manager: unknown) => unknown) {
        return work(this);
      }),
      query: jest.fn().mockResolvedValue([]),
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
    expect(mockGrantTenantSchemaAppPrivileges).toHaveBeenCalledTimes(1);
    expect(tenantSeedService.seedInitialAdmin).not.toHaveBeenCalled();
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
      // DT-4: el UPDATE condicional exige que la fila siga en PROVISIONING.
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const dataSource = {
      getRepository: jest.fn().mockReturnValue(tenantRepository),
      createQueryBuilder: jest.fn().mockReturnValue(updateBuilder),
      // F2-D2: el cambio de estado y su auditoría van en una transacción sobre el mismo doble.
      transaction: jest.fn(async function (this: unknown, work: (manager: unknown) => unknown) {
        return work(this);
      }),
      query: jest.fn().mockResolvedValue([]),
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

  // ─────────────────────────────────────────────────────────────────────────
  // DT-4 (spec 2026-11-09-plat-ops-dt4 §3-§4): el aprovisionamiento no reactiva ni toca un
  // tenant que no esté en PROVISIONING.
  // ─────────────────────────────────────────────────────────────────────────
  describe('DT-4 — guarda de estado del tenant', () => {
    const job = {
      data: { tenantId: 'tenant-uuid-1', schemaName: 'tenant_isp_test', tenantSlug: 'isp-test' },
    } as never;

    const CONDITIONAL_WHERE = 'id = :id AND status = :expectedStatus';
    const CONDITIONAL_PARAMS = { id: 'tenant-uuid-1', expectedStatus: 'PROVISIONING' };

    function buildHarness(status: string | null, executeResult: unknown = { affected: 1 }) {
      const tenantRepository = {
        findOne: jest
          .fn()
          .mockResolvedValue(
            status === null
              ? null
              : { id: 'tenant-uuid-1', slug: 'isp-test', schemaName: 'tenant_isp_test', status },
          ),
      };
      const updateBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(executeResult),
      };
      const dataSource = {
        getRepository: jest.fn().mockReturnValue(tenantRepository),
        createQueryBuilder: jest.fn().mockReturnValue(updateBuilder),
        // F2-D2: el cambio de estado y su auditoría van en una transacción sobre el mismo doble.
        transaction: jest.fn(async function (this: unknown, work: (manager: unknown) => unknown) {
          return work(this);
        }),
        query: jest.fn().mockResolvedValue([]),
      } as unknown as DataSource;
      const tenantSeedService = {
        seedInitialAdmin: jest.fn().mockResolvedValue({ created: true }),
        seedTaxPresets: jest.fn().mockResolvedValue(undefined),
      } as unknown as TenantSeedService;
      const processor = new TenantProvisioningProcessor(dataSource, tenantSeedService);
      return { processor, dataSource, updateBuilder, tenantSeedService };
    }

    function poolSql(): string[] {
      return mockPool.query.mock.calls.map((call) => String(call[0]));
    }

    function mockSchemaAbsent(): void {
      mockPool.query.mockReset();
      mockPool.query.mockResolvedValue({ rowCount: 0, rows: [] });
    }

    function mockSchemaComplete(): void {
      mockPool.query.mockReset();
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('information_schema.schemata')) {
          return { rowCount: 1, rows: [{ schema_name: 'tenant_isp_test' }] };
        }
        if (sql.includes('information_schema.tables')) {
          return { rowCount: 1, rows: [{ count: '1' }] };
        }
        if (sql.includes('typeorm_migrations')) return { rowCount: 1, rows: [{ count: '2' }] };
        return { rowCount: 0, rows: [] };
      });
    }

    function hasWarnWithCode(warn: jest.SpyInstance, code: string): boolean {
      return warn.mock.calls.some((call) => String(call[0]).includes(code));
    }

    const NOT_PROVISIONABLE = [
      'MARKED_FOR_DELETION',
      'INACTIVE',
      'SUSPENDED',
      'PROVISIONING_FAILED',
    ] as const;

    it.each(NOT_PROVISIONABLE)(
      'U1: %s sin esquema → UnrecoverableError TENANT_NOT_PROVISIONABLE sin DDL, seed ni UPDATE',
      async (status) => {
        mockSchemaAbsent();
        const { processor, dataSource, tenantSeedService } = buildHarness(status);

        const outcome = processor.process(job);
        await expect(outcome).rejects.toBeInstanceOf(UnrecoverableError);
        await expect(outcome).rejects.toMatchObject({
          message: expect.stringContaining('code=TENANT_NOT_PROVISIONABLE'),
        });

        expect(mockPool.connect).not.toHaveBeenCalled();
        expect(mockClient.query).not.toHaveBeenCalled();
        expect(mockApplyTenantMigrationsInOrder).not.toHaveBeenCalled();
        expect(mockGrantTenantSchemaAppPrivileges).not.toHaveBeenCalled();
        expect(tenantSeedService.seedInitialAdmin).not.toHaveBeenCalled();
        expect(tenantSeedService.seedTaxPresets).not.toHaveBeenCalled();
        expect(dataSource.createQueryBuilder).not.toHaveBeenCalled();
        expect(poolSql().some((sql) => /DROP SCHEMA|CREATE SCHEMA/u.test(sql))).toBe(false);
        // DT-4: el estado se lee antes de checkSchemaExists (sin consultas al catálogo).
        expect(poolSql().some((sql) => sql.includes('information_schema'))).toBe(false);
        // El lock se libera aunque el job se rechace.
        expect(poolSql().some((sql) => sql.includes('pg_advisory_unlock'))).toBe(true);
      },
    );

    it.each(NOT_PROVISIONABLE)(
      'U2: %s con esquema completo → mismo rechazo, sin UPDATE a ACTIVE ni grants',
      async (status) => {
        mockSchemaComplete();
        const { processor, dataSource, tenantSeedService } = buildHarness(status);

        const outcome = processor.process(job);
        await expect(outcome).rejects.toBeInstanceOf(UnrecoverableError);
        await expect(outcome).rejects.toMatchObject({
          message: expect.stringContaining('code=TENANT_NOT_PROVISIONABLE'),
        });

        expect(dataSource.createQueryBuilder).not.toHaveBeenCalled();
        expect(mockGrantTenantSchemaAppPrivileges).not.toHaveBeenCalled();
        expect(mockApplyTenantMigrationsInOrder).not.toHaveBeenCalled();
        expect(tenantSeedService.seedInitialAdmin).not.toHaveBeenCalled();
        expect(poolSql().some((sql) => /DROP SCHEMA|CREATE SCHEMA/u.test(sql))).toBe(false);
        // DT-4: el estado se lee antes de checkSchemaExists (sin consultas al catálogo).
        expect(poolSql().some((sql) => sql.includes('information_schema'))).toBe(false);
      },
    );

    it('U3: PROVISIONING y el UPDATE final afecta 0 filas → warn, sin DROP ni markFailed, sin error', async () => {
      mockSchemaAbsent();
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const { processor, updateBuilder } = buildHarness('PROVISIONING', { affected: 0 });

      try {
        await expect(processor.process(job)).resolves.toBeUndefined();

        expect(updateBuilder.set).toHaveBeenCalledTimes(1);
        expect(updateBuilder.set).toHaveBeenCalledWith({ status: 'ACTIVE' });
        expect(updateBuilder.set).not.toHaveBeenCalledWith({ status: 'PROVISIONING_FAILED' });
        expect(updateBuilder.where).toHaveBeenCalledWith(CONDITIONAL_WHERE, CONDITIONAL_PARAMS);
        expect(poolSql().some((sql) => sql.includes('DROP SCHEMA'))).toBe(false);
        expect(hasWarnWithCode(warn, 'TENANT_STATUS_CHANGED_DURING_PROVISIONING')).toBe(true);
      } finally {
        warn.mockRestore();
      }
    });

    it('U3b: PROVISIONING en la ruta de recuperación con UPDATE de 0 filas → warn, sin DROP ni markFailed', async () => {
      mockSchemaComplete();
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const { processor, updateBuilder } = buildHarness('PROVISIONING', { affected: 0 });

      try {
        await expect(processor.process(job)).resolves.toBeUndefined();

        expect(updateBuilder.set).toHaveBeenCalledTimes(1);
        expect(updateBuilder.set).toHaveBeenCalledWith({ status: 'ACTIVE' });
        expect(updateBuilder.where).toHaveBeenCalledWith(CONDITIONAL_WHERE, CONDITIONAL_PARAMS);
        expect(poolSql().some((sql) => sql.includes('DROP SCHEMA'))).toBe(false);
        expect(hasWarnWithCode(warn, 'TENANT_STATUS_CHANGED_DURING_PROVISIONING')).toBe(true);
      } finally {
        warn.mockRestore();
      }
    });

    it('U4: fallo de migración con tenant PROVISIONING → markFailed con WHERE condicionado a PROVISIONING', async () => {
      mockSchemaAbsent();
      mockApplyTenantMigrationsInOrder.mockRejectedValueOnce(new Error('migración rota'));
      const { processor, updateBuilder } = buildHarness('PROVISIONING');

      await expect(processor.process(job)).rejects.toMatchObject({
        message: 'class=Error sqlstate=none',
      });

      expect(updateBuilder.set).toHaveBeenCalledWith({ status: 'PROVISIONING_FAILED' });
      expect(updateBuilder.where).toHaveBeenCalledWith(CONDITIONAL_WHERE, CONDITIONAL_PARAMS);
      expect(updateBuilder.where).not.toHaveBeenCalledWith('id = :id', expect.anything());
    });

    it('ACTIVE con esquema → no-op idempotente: reaplica grants y no cambia el estado', async () => {
      mockSchemaComplete();
      const { processor, dataSource, tenantSeedService } = buildHarness('ACTIVE');

      await expect(processor.process(job)).resolves.toBeUndefined();

      expect(mockGrantTenantSchemaAppPrivileges).toHaveBeenCalledTimes(1);
      expect(dataSource.createQueryBuilder).not.toHaveBeenCalled();
      expect(mockApplyTenantMigrationsInOrder).not.toHaveBeenCalled();
      expect(tenantSeedService.seedInitialAdmin).not.toHaveBeenCalled();
      expect(poolSql().some((sql) => /DROP SCHEMA|CREATE SCHEMA/u.test(sql))).toBe(false);
    });

    it('ACTIVE sin esquema → no-op: sin grants, sin DDL y sin cambio de estado', async () => {
      mockSchemaAbsent();
      const { processor, dataSource } = buildHarness('ACTIVE');

      await expect(processor.process(job)).resolves.toBeUndefined();

      expect(mockGrantTenantSchemaAppPrivileges).not.toHaveBeenCalled();
      expect(dataSource.createQueryBuilder).not.toHaveBeenCalled();
      expect(mockPool.connect).not.toHaveBeenCalled();
      expect(poolSql().some((sql) => /DROP SCHEMA|CREATE SCHEMA/u.test(sql))).toBe(false);
    });

    // Contrato: un fallo del GRANT sobre un tenant en uso se propaga (error
    // reintentable por BullMQ, no UnrecoverableError) pero nunca dispara el
    // rollback: ni DROP SCHEMA ni markFailed sobre un tenant ACTIVE.
    it('ACTIVE con esquema y GRANT que falla → el error sube sin DROP ni markFailed', async () => {
      mockSchemaComplete();
      mockGrantTenantSchemaAppPrivileges.mockRejectedValueOnce(new Error('rol app ausente'));
      const { processor, dataSource } = buildHarness('ACTIVE');

      const outcome = processor.process(job);
      await expect(outcome).rejects.toMatchObject({ message: 'class=Error sqlstate=none' });
      await expect(outcome).rejects.not.toBeInstanceOf(UnrecoverableError);

      expect(dataSource.createQueryBuilder).not.toHaveBeenCalled();
      expect(poolSql().some((sql) => /DROP SCHEMA|CREATE SCHEMA/u.test(sql))).toBe(false);
      expect(poolSql().some((sql) => sql.includes('pg_advisory_unlock'))).toBe(true);
    });

    // DT-4 v1.1 §8.2 W1: un reintento colado no aprovisiona dos veces. Fake con
    // estado: el UPDATE condicional del primer process() escribe la fila que
    // lee el segundo; nada está programado por llamada.
    it('W1: dos process() seguidos del mismo tenant → el segundo lee ACTIVE y no hace DDL ni seed', async () => {
      const row = { id: 'tenant-uuid-1', status: 'PROVISIONING' };
      const schemas = new Set<string>();

      mockPool.query.mockReset();
      mockPool.query.mockImplementation(async (sql: string, params?: unknown[]) => {
        if (sql.includes('information_schema.schemata')) {
          const exists = schemas.has(String(params?.[0]));
          return exists
            ? { rowCount: 1, rows: [{ schema_name: params?.[0] }] }
            : { rowCount: 0, rows: [] };
        }
        return { rowCount: 0, rows: [] };
      });
      mockClient.query.mockImplementation(async (sql: string) => {
        const created = /^CREATE SCHEMA IF NOT EXISTS "([^"]+)"$/u.exec(sql);
        if (created?.[1]) schemas.add(created[1]);
        return { rowCount: 0, rows: [] };
      });

      let pendingSet: { status?: string } = {};
      let pendingParams: { id?: string; expectedStatus?: string } = {};
      const updateBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockImplementation(function (this: unknown, patch: { status?: string }) {
          pendingSet = patch;
          return updateBuilder;
        }),
        where: jest.fn().mockImplementation((_sql: string, params: typeof pendingParams) => {
          pendingParams = params;
          return updateBuilder;
        }),
        execute: jest.fn().mockImplementation(async () => {
          if (pendingParams.id !== row.id || pendingParams.expectedStatus !== row.status) {
            return { affected: 0 };
          }
          Object.assign(row, pendingSet);
          return { affected: 1 };
        }),
      };
      const dataSource = {
        getRepository: jest.fn().mockReturnValue({
          findOne: jest.fn().mockImplementation(async () => ({ ...row })),
        }),
        createQueryBuilder: jest.fn().mockReturnValue(updateBuilder),
        // F2-D2: el cambio de estado y su auditoría van en una transacción sobre el mismo doble.
        transaction: jest.fn(async function (this: unknown, work: (manager: unknown) => unknown) {
          return work(this);
        }),
        query: jest.fn().mockResolvedValue([]),
      } as unknown as DataSource;
      const tenantSeedService = {
        seedInitialAdmin: jest.fn().mockResolvedValue({ created: true }),
        seedTaxPresets: jest.fn().mockResolvedValue(undefined),
      } as unknown as TenantSeedService;
      const processor = new TenantProvisioningProcessor(dataSource, tenantSeedService);

      try {
        await expect(processor.process(job)).resolves.toBeUndefined();
        expect(row.status).toBe('ACTIVE');
        await expect(processor.process(job)).resolves.toBeUndefined();

        expect(mockClient.query).toHaveBeenCalledTimes(1);
        expect(mockClient.query).toHaveBeenCalledWith(
          'CREATE SCHEMA IF NOT EXISTS "tenant_isp_test"',
        );
        expect(mockApplyTenantMigrationsInOrder).toHaveBeenCalledTimes(1);
        expect(tenantSeedService.seedInitialAdmin).toHaveBeenCalledTimes(1);
        expect(tenantSeedService.seedTaxPresets).toHaveBeenCalledTimes(1);
        // Solo el primero escribe estado; el segundo es el no-op de ACTIVE.
        expect(updateBuilder.execute).toHaveBeenCalledTimes(1);
        // El segundo solo reaplica grants (ACTIVE con esquema existente).
        expect(mockGrantTenantSchemaAppPrivileges).toHaveBeenCalledTimes(2);
        expect(poolSql().some((sql) => sql.includes('DROP SCHEMA'))).toBe(false);
        expect(row.status).toBe('ACTIVE');
      } finally {
        mockClient.query.mockReset();
      }
    });

    it('tenant inexistente → UnrecoverableError sin DROP SCHEMA y con el lock liberado', async () => {
      mockSchemaAbsent();
      const { processor, updateBuilder } = buildHarness(null);

      await expect(processor.process(job)).rejects.toBeInstanceOf(UnrecoverableError);

      expect(poolSql().some((sql) => /DROP SCHEMA|CREATE SCHEMA/u.test(sql))).toBe(false);
      expect(poolSql().some((sql) => sql.includes('pg_advisory_unlock'))).toBe(true);
      expect(mockPool.connect).not.toHaveBeenCalled();
      // markFailed condicional (no-op sobre una fila inexistente).
      expect(updateBuilder.where).toHaveBeenCalledWith(CONDITIONAL_WHERE, CONDITIONAL_PARAMS);
    });

    it('schemaName inválido → markFailed condicional a PROVISIONING, sin lock ni DDL', async () => {
      mockSchemaAbsent();
      (isValidSchemaName as jest.Mock).mockReturnValueOnce(false);
      const { processor, dataSource, updateBuilder } = buildHarness('PROVISIONING');

      await expect(processor.process(job)).rejects.toBeInstanceOf(UnrecoverableError);

      expect(updateBuilder.set).toHaveBeenCalledWith({ status: 'PROVISIONING_FAILED' });
      expect(updateBuilder.where).toHaveBeenCalledWith(CONDITIONAL_WHERE, CONDITIONAL_PARAMS);
      expect(mockPool.query).not.toHaveBeenCalled();
      expect(mockPool.connect).not.toHaveBeenCalled();
      expect(dataSource.getRepository).not.toHaveBeenCalled();
    });
  });
});
