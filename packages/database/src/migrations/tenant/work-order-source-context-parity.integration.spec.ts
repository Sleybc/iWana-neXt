import { randomBytes, randomUUID } from 'node:crypto';
import { WorkOrderSourceContext } from '@iwana/shared';
import { DataSource } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { applyTenantMigrationsInOrder, createTenantDataSource } from './runner';

/**
 * Paridad contrato ↔ base: los valores de `WorkOrderSourceContext` deben ser
 * exactamente los del tipo `work_order_source_context` de un schema tenant
 * creado con la cadena completa de migraciones. Si el contrato gana un valor
 * sin migración (como pasó con TASKS hasta la 152), este test falla.
 */
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Paridad work_order_source_context: DB_NAME debe ser test o iwana_it_*; crea y elimina un schema efímero.',
  );
}

const schema = `tenant_wo_origin_parity_${randomBytes(4).toString('hex')}`;
const tenantId = randomUUID();
const quoted = `"${schema.replaceAll('"', '""')}"`;

describeWithDb('Paridad WorkOrderSourceContext ↔ pg_enum work_order_source_context', () => {
  let dataSource: DataSource | undefined;

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
    await dataSource.query(`CREATE SCHEMA ${quoted}`);
    await dataSource.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
       VALUES ($1, 'Paridad origen WFM sintético', $2, $3, 'ACTIVE', 'parity@example.invalid')`,
      [tenantId, schema.replaceAll('_', '-'), schema],
    );
    const tenantDs = createTenantDataSource(dataSource, schema, `parity-${schema}`);
    await tenantDs.initialize();
    try {
      await applyTenantMigrationsInOrder(tenantDs);
    } finally {
      await tenantDs.destroy();
    }
  }, 300_000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    try {
      await dataSource.query(`DROP SCHEMA IF EXISTS ${quoted} CASCADE`);
      await dataSource.query('DELETE FROM public.tenants WHERE id = $1', [tenantId]);
    } finally {
      await dataSource.destroy();
    }
  });

  it('el tipo persistido tiene exactamente los valores del contrato compartido', async () => {
    const rows = (await dataSource!.query(
      `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'work_order_source_context' AND t.typnamespace = $1::regnamespace`,
      [schema],
    )) as Array<{ enumlabel: string }>;

    const persisted = rows.map((row) => row.enumlabel).sort();
    const contract = (Object.values(WorkOrderSourceContext) as string[]).sort();

    expect(persisted).toEqual(contract);
  });
});
