import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { WorkOrderSourceContextTasks1520000000000 } from './152_work_order_source_context_tasks';
import { applyTenantMigrationsInOrder, createTenantDataSource } from './runner';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración 152: DB_NAME debe ser test o iwana_it_*; crea y elimina dos schemas tenant efímeros.',
  );
}

interface TenantFixture {
  schema: string;
  tenantId: string;
}

const suffix = randomBytes(4).toString('hex');
/** A conserva filas con TASKS; B no tiene ninguna (C6: dos schemas tenant). */
const tenantA: TenantFixture = {
  schema: `tenant_wo_origin_152_a_${suffix}`,
  tenantId: randomUUID(),
};
const tenantB: TenantFixture = {
  schema: `tenant_wo_origin_152_b_${suffix}`,
  tenantId: randomUUID(),
};

function quote(schema: string): string {
  return `"${schema.replaceAll('"', '""')}"`;
}

describeWithDb('Migración 152 — TASKS en work_order_source_context sobre PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  const migration = new WorkOrderSourceContextTasks1520000000000();

  function ds(): DataSource {
    if (!dataSource) throw new Error('DataSource de integración no inicializado.');
    return dataSource;
  }

  async function labels(schema: string): Promise<string[]> {
    const rows = (await ds().query(
      `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'work_order_source_context' AND t.typnamespace = $1::regnamespace
        ORDER BY e.enumsortorder`,
      [schema],
    )) as Array<{ enumlabel: string }>;
    return rows.map((row) => row.enumlabel);
  }

  async function columnTypes(schema: string): Promise<string[]> {
    const rows = (await ds().query(
      `SELECT c.table_name || '.' || c.column_name AS col, c.udt_schema || '.' || c.udt_name AS typ
         FROM information_schema.columns c
        WHERE c.table_schema = $1
          AND ((c.table_name = 'work_orders' AND c.column_name = 'source_context')
            OR (c.table_name = 'visit_requests' AND c.column_name = 'origin_context'))
        ORDER BY 1`,
      [schema],
    )) as Array<{ col: string; typ: string }>;
    return rows.map((row) => `${row.col}:${row.typ}`);
  }

  /** Ejecuta en una transacción con el search_path del tenant, como el runner. */
  async function inSchema<T>(schema: string, work: (qr: QueryRunner) => Promise<T>): Promise<T> {
    const qr = ds().createQueryRunner();
    await qr.connect();
    try {
      await qr.startTransaction();
      await qr.query(`SET LOCAL search_path TO ${quote(schema)}`);
      const result = await work(qr);
      await qr.commitTransaction();
      return result;
    } catch (error) {
      if (qr.isTransactionActive) await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  async function insertTasksRows(tenant: TenantFixture): Promise<void> {
    await inSchema(tenant.schema, async (qr) => {
      await qr.query(
        `INSERT INTO work_orders
           (tenant_id, code, type, assigned_user_id, source_context, source_ref, summary, created_by)
         VALUES ($1, $2, 'TECHNICAL_VISIT', $3, 'TASKS', $4, 'Orden ficticia', $3)`,
        [tenant.tenantId, `WO-152-${randomBytes(3).toString('hex')}`, randomUUID(), randomUUID()],
      );
      await qr.query(
        `INSERT INTO visit_requests
           (tenant_id, status, origin_context, origin_ref, work_type, priority, title,
            requested_by_user_id)
         VALUES ($1, 'PENDING', 'TASKS', $2, 'TECHNICAL_VISIT', 'NORMAL', 'Visita ficticia', $3)`,
        [tenant.tenantId, randomUUID(), randomUUID()],
      );
    });
  }

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? '',
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();

    for (const tenant of [tenantA, tenantB]) {
      await dataSource.query(`CREATE SCHEMA ${quote(tenant.schema)}`);
      await dataSource.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
         VALUES ($1, 'Migración 152 sintético', $2, $3, 'ACTIVE', 'm152@example.invalid')`,
        [tenant.tenantId, tenant.schema.replaceAll('_', '-'), tenant.schema],
      );
      const tenantDs = createTenantDataSource(dataSource, tenant.schema, `m152-${tenant.schema}`);
      await tenantDs.initialize();
      try {
        await applyTenantMigrationsInOrder(tenantDs);
      } finally {
        await tenantDs.destroy();
      }
    }
  }, 300_000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    try {
      for (const tenant of [tenantA, tenantB]) {
        await dataSource.query(`DROP SCHEMA IF EXISTS ${quote(tenant.schema)} CASCADE`);
        await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenant.tenantId]);
      }
    } finally {
      await dataSource.destroy();
    }
  });

  it('la cadena del runner deja TASKS en ambos schemas, en el tipo de cada uno', async () => {
    for (const tenant of [tenantA, tenantB]) {
      expect(await labels(tenant.schema)).toEqual([
        'CRM',
        'ASSURANCE',
        'PROVISIONING',
        'MANUAL',
        'TASKS',
      ]);
      expect(await columnTypes(tenant.schema)).toEqual([
        `visit_requests.origin_context:${tenant.schema}.work_order_source_context`,
        `work_orders.source_context:${tenant.schema}.work_order_source_context`,
      ]);
    }
    const applied = (await ds().query(
      `SELECT COUNT(*)::int AS total FROM ${quote(tenantA.schema)}.typeorm_migrations WHERE name = $1`,
      [migration.name],
    )) as Array<{ total: number }>;
    expect(applied[0]?.total).toBe(1);
  });

  it('up es idempotente: repetirlo no duplica ni falla', async () => {
    await inSchema(tenantA.schema, (qr) => migration.up(qr));
    expect((await labels(tenantA.schema)).filter((label) => label === 'TASKS')).toHaveLength(1);
  });

  it('down con filas TASKS en A no cambia nada; en B (sin filas) quita TASKS sin tocar A', async () => {
    await insertTasksRows(tenantA);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await inSchema(tenantA.schema, (qr) => migration.down(qr));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('work_orders=1, visit_requests=1'));
    warn.mockRestore();
    expect(await labels(tenantA.schema)).toContain('TASKS');

    await inSchema(tenantB.schema, (qr) => migration.down(qr));
    expect(await labels(tenantB.schema)).toEqual(['CRM', 'ASSURANCE', 'PROVISIONING', 'MANUAL']);
    expect(await columnTypes(tenantB.schema)).toEqual([
      `visit_requests.origin_context:${tenantB.schema}.work_order_source_context`,
      `work_orders.source_context:${tenantB.schema}.work_order_source_context`,
    ]);
    const leftovers = (await ds().query(
      `SELECT COUNT(*)::int AS total FROM pg_type
        WHERE typname = 'work_order_source_context_old' AND typnamespace = $1::regnamespace`,
      [tenantB.schema],
    )) as Array<{ total: number }>;
    expect(leftovers[0]?.total).toBe(0);
    await expect(insertTasksRows(tenantB)).rejects.toMatchObject({
      driverError: { code: '22P02' },
    });

    // A conserva su valor y sus filas: el down de B no ve el enum de A.
    expect(await labels(tenantA.schema)).toContain('TASKS');
    const rowsA = (await ds().query(
      `SELECT
         (SELECT COUNT(*)::int FROM ${quote(tenantA.schema)}.work_orders WHERE source_context = 'TASKS') AS wo,
         (SELECT COUNT(*)::int FROM ${quote(tenantA.schema)}.visit_requests WHERE origin_context = 'TASKS') AS vr`,
    )) as Array<{ wo: number; vr: number }>;
    expect(rowsA[0]).toEqual({ wo: 1, vr: 1 });
  });

  it('re-up en B restaura TASKS y vuelve a admitir escrituras con ese origen', async () => {
    await inSchema(tenantB.schema, (qr) => migration.up(qr));

    expect(await labels(tenantB.schema)).toEqual([
      'CRM',
      'ASSURANCE',
      'PROVISIONING',
      'MANUAL',
      'TASKS',
    ]);
    await expect(insertTasksRows(tenantB)).resolves.toBeUndefined();
  });
});
