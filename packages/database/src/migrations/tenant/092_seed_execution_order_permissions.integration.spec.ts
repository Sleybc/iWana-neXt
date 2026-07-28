import { randomBytes, randomUUID } from 'node:crypto';

import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { PaginationOrderingIndexes0890000000000 } from './089_pagination_ordering_indexes';
import { ExecutionOrderContractReliability0900000000000 } from './090_execution_order_contract_reliability';
import { ExecutionOrderScheduleUnique0910000000000 } from './091_execution_order_schedule_unique';
import { SeedExecutionOrderPermissions0920000000000 } from './092_seed_execution_order_permissions';
import { ExtendVisitRequestStatusAndOutboxOccurredAt0930000000000 } from './093_extend_visit_request_status_and_outbox_occurred_at';
import { TemplateVersioningAndClosureGate0940000000000 } from './094_template_versioning_and_closure_gate';
import { CreateExecutionOrderEvidenceUploadIntents0950000000000 } from './095_create_execution_order_evidence_upload_intents';

let schemas: [string, string];
let tenantIds: [string, string];
const PERMISSION_KEYS = [
  'operations.execution_orders.read',
  'operations.execution_orders.execute',
  'operations.execution_orders.supervise',
  'operations.execution_order_templates.read',
  'operations.execution_order_templates.manage',
  'operations.execution_events.redrive',
  'wfm.work_orders.execute',
] as const;

/** SQL exacto de 092 antes de la corrección: la evidencia debe ser 42P01 real. */
const HISTORICAL_092_SQL = `
  INSERT INTO access_permission_catalog
    (tenant_id, permission_key, module_key, action, description, catalog_version, availability, is_system, is_active)
  SELECT
    tenants.tenant_id,
    seeds.permission_key,
    seeds.module_key,
    seeds.action,
    seeds.description,
    seeds.catalog_version,
    seeds.availability,
    seeds.is_system,
    seeds.is_active
  FROM
    (VALUES
      ('operations.execution_orders.read', 'operations', 'read', 'Consultar órdenes de ejecución asignadas y supervisadas', 'MOD00_ACCESS_V1', 'ASSIGNABLE', true, true),
      ('operations.execution_orders.execute', 'operations', 'execute', 'Ejecutar actividades, evidencias y cierre de órdenes asignadas', 'MOD00_ACCESS_V1', 'ASSIGNABLE', true, true),
      ('operations.execution_orders.supervise', 'operations', 'supervise', 'Asignar y supervisar órdenes de ejecución', 'MOD00_ACCESS_V1', 'ASSIGNABLE', true, true),
      ('operations.execution_order_templates.read', 'operations', 'read', 'Consultar plantillas de ejecución', 'MOD00_ACCESS_V1', 'ASSIGNABLE', true, true),
      ('operations.execution_order_templates.manage', 'operations', 'manage', 'Administrar versiones de plantillas de ejecución', 'MOD00_ACCESS_V1', 'ASSIGNABLE', true, true),
      ('operations.execution_events.redrive', 'operations', 'redrive', 'Reintentar eventos fallidos de ejecución con ticket operativo', 'MOD00_ACCESS_V1', 'ASSIGNABLE', true, true),
      ('wfm.work_orders.execute', 'wfm', 'execute', 'Ejecutar órdenes de trabajo asignadas [DEPRECADO: usar operations.execution_orders.execute]', 'MOD00_ACCESS_V1', 'ASSIGNABLE', true, true)
    ) AS seeds(permission_key, module_key, action, description, catalog_version, availability, is_system, is_active)
  CROSS JOIN LATERAL (SELECT id AS tenant_id FROM tenant_settings LIMIT 1) AS tenants
  ON CONFLICT (tenant_id, permission_key) DO NOTHING
`;

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;

if (!dbAvailable) {
  console.warn(
    '[092-integration] describe.skip activo — sin PostgreSQL alcanzable; la prueba de runtime 42P01 queda sin ejecutar.',
  );
}

describeWithDb('092 execution-order permission seed — PostgreSQL real', () => {
  let dataSource: DataSource;
  const runners: QueryRunner[] = [];
  const migration = new SeedExecutionOrderPermissions0920000000000();

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'iwana',
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();

    const bootstrap = dataSource.createQueryRunner();
    await bootstrap.connect();
    try {
      const suffix = randomBytes(8).toString('hex');
      schemas = [`it_092_${suffix}_a`, `it_092_${suffix}_b`];
      tenantIds = [randomUUID(), randomUUID()];
      for (const [index, schema] of schemas.entries()) {
        await bootstrap.query(`CREATE SCHEMA "${schema}"`);
        await bootstrap.query(
          `INSERT INTO public.tenants (id, name, slug, schema_name, contact_email)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            tenantIds[index],
            `Integration tenant ${index + 1}`,
            `${schema}-slug`,
            schema,
            `${schema}@invalid.example`,
          ],
        );
      }
    } finally {
      await bootstrap.release();
    }

    for (const schema of schemas) {
      const runner = dataSource.createQueryRunner();
      await runner.connect();
      await runner.query(`SET search_path TO "${schema}"`);
      await runner.query(`CREATE TABLE access_permission_catalog (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        permission_key VARCHAR(120) NOT NULL,
        module_key VARCHAR(60) NOT NULL,
        action VARCHAR(60) NOT NULL,
        description VARCHAR(240) NOT NULL,
        catalog_version VARCHAR(40) NOT NULL,
        availability VARCHAR(20) NOT NULL,
        is_system BOOLEAN NOT NULL DEFAULT true,
        is_active BOOLEAN NOT NULL DEFAULT true,
        PRIMARY KEY (id), UNIQUE (tenant_id, permission_key)
      )`);
      const paginationTables = [
        ['inventory_items', 'id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL'],
        ['stock_balances', 'id UUID PRIMARY KEY, updated_at TIMESTAMPTZ NOT NULL'],
        ['serialized_assets', 'id UUID PRIMARY KEY, updated_at TIMESTAMPTZ NOT NULL'],
        ['stock_locations', 'id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL'],
        ['purchase_requests', 'id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL'],
        ['subscribers', 'id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL'],
        ['supplier_profiles', 'id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL'],
        ['inventory_write_offs', 'id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL'],
        ['asset_loan_assignments', 'id UUID PRIMARY KEY, installed_at TIMESTAMPTZ'],
        ['audit_logs', 'id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL'],
        ['stock_issues', 'id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL'],
        ['stock_counts', 'id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL'],
        ['visit_requests', 'id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL'],
        ['support_tickets', 'id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL'],
        [
          'stock_movements',
          'id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL, movement_number VARCHAR(60) NOT NULL',
        ],
        [
          'catalog_items',
          'id UUID PRIMARY KEY, updated_at TIMESTAMPTZ NOT NULL, is_active BOOLEAN NOT NULL, name VARCHAR(300) NOT NULL, deleted_at TIMESTAMPTZ',
        ],
      ] as const;
      for (const [table, columns] of paginationTables) {
        await runner.query(`CREATE TABLE "${table}" (${columns})`);
      }
      await runner.query(`CREATE TYPE wfm_work_type AS ENUM ('INSTALLATION')`);
      await runner.query(`CREATE TYPE visit_request_status AS ENUM ('CREATED')`);
      await runner.query(`CREATE TABLE execution_orders (
        id UUID PRIMARY KEY, tenant_id UUID NOT NULL, schedule_event_id UUID NOT NULL
      )`);
      await runner.query(
        `CREATE TABLE execution_order_item_usage (id UUID PRIMARY KEY, tenant_id UUID NOT NULL)`,
      );
      await runner.query(
        `CREATE TABLE execution_order_evidence (id UUID PRIMARY KEY, tenant_id UUID NOT NULL)`,
      );
      await runner.query(`CREATE TABLE execution_order_outbox_events (
        id UUID PRIMARY KEY, event_id UUID NOT NULL, tenant_id UUID NOT NULL,
        aggregate_id UUID NOT NULL, aggregate_version INTEGER NOT NULL, event_type VARCHAR(120) NOT NULL,
        payload JSONB NOT NULL, correlation_id UUID NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0,
        available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), lease_until TIMESTAMPTZ, published_at TIMESTAMPTZ,
        last_error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      runners.push(runner);
    }
  });

  afterAll(async () => {
    for (const runner of runners) await runner.release();
    if (!dataSource?.isInitialized) return;
    if (!schemas || !tenantIds) {
      await dataSource.destroy();
      return;
    }
    const cleanup = dataSource.createQueryRunner();
    await cleanup.connect();
    try {
      for (const schema of schemas) {
        await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await cleanup.query(`DELETE FROM public.tenants WHERE id = $1`, [
          tenantIds[schemas.indexOf(schema)],
        ]);
      }
    } finally {
      await cleanup.release();
      await dataSource.destroy();
    }
  });

  it('siembra las 6 claves canónicas y el alias en dos schemas aislados', async () => {
    for (const runner of runners) await expect(migration.up(runner)).resolves.toBeUndefined();

    for (const runner of runners) {
      const rows = (await runner.query(
        `SELECT permission_key, tenant_id FROM access_permission_catalog ORDER BY permission_key`,
      )) as Array<{ permission_key: string; tenant_id: string }>;
      expect(rows.map((row) => row.permission_key)).toEqual([...PERMISSION_KEYS].sort());
      expect(new Set(rows.map((row) => row.tenant_id)).size).toBe(1);
    }
  });

  it('es idempotente y down no borra claves de runtime ajenas al seeder', async () => {
    const first = runners[0];
    const second = runners[1];
    if (!first || !second) throw new Error('Expected two PostgreSQL query runners');
    const zeroRows = await first.query(
      `INSERT INTO access_permission_catalog
       (tenant_id, permission_key, module_key, action, description, catalog_version, availability)
       SELECT id, 'operations.execution_orders.read', 'operations', 'read',
         'Consultar órdenes de ejecución asignadas y supervisadas', 'MOD00_ACCESS_V1', 'ASSIGNABLE'
       FROM public.tenants WHERE schema_name = $1
       ON CONFLICT (tenant_id, permission_key) DO NOTHING
       RETURNING permission_key`,
      [schemas[0]],
    );
    expect(zeroRows).toHaveLength(0);
    await migration.up(first);
    await first.query(
      `INSERT INTO access_permission_catalog
       (tenant_id, permission_key, module_key, action, description, catalog_version, availability)
       SELECT id, 'runtime.custom.permission', 'runtime', 'read', 'Runtime permission', 'RUNTIME', 'ASSIGNABLE'
       FROM public.tenants WHERE schema_name = $1`,
      [schemas[0]],
    );
    // Reproduce la rama de ensurePermissionCatalogSeeded(): reusa la fila,
    // reasigna toda su definición canónica y la vuelve a guardar. Aunque los
    // valores queden iguales, PostgreSQL emite una nueva versión de tupla.
    await first.query(
      `UPDATE access_permission_catalog
       SET module_key = 'operations', action = 'read',
           description = 'Consultar órdenes de ejecución asignadas y supervisadas',
           catalog_version = 'MOD00_ACCESS_V1', availability = 'ASSIGNABLE',
           is_system = true, is_active = true
       WHERE permission_key = 'operations.execution_orders.read'`,
    );
    await migration.up(first);
    await migration.down(first);
    const remaining = (await first.query(
      `SELECT permission_key FROM access_permission_catalog`,
    )) as Array<{ permission_key: string }>;
    expect(remaining.map((row) => row.permission_key).sort()).toEqual([
      'operations.execution_orders.read',
      'runtime.custom.permission',
    ]);
    const provenance = (await first.query(
      `SELECT to_regclass(current_schema() || '.execution_order_permission_seed_092') AS table_name`,
    )) as Array<{ table_name: string | null }>;
    expect(provenance[0]?.table_name).toBe('execution_order_permission_seed_092');

    await migration.up(second);
    await migration.down(second);
  });

  it('conserva evidencia reproducible del rojo histórico 42P01 sin romper el seed', async () => {
    // Ejecuta el SQL histórico exacto en el schema aislado. La migración
    // corregida no lo ejecuta ni depende de que el estado productivo permanezca roto.
    const runner = runners[0];
    if (!runner) throw new Error('Expected first PostgreSQL query runner');
    await expect(runner.query(HISTORICAL_092_SQL)).rejects.toMatchObject({ code: '42P01' });
  });

  it('ejecuta 089→095 contra los dos schemas de prueba', async () => {
    const chain = [
      new PaginationOrderingIndexes0890000000000(),
      new ExecutionOrderContractReliability0900000000000(),
      new ExecutionOrderScheduleUnique0910000000000(),
      new SeedExecutionOrderPermissions0920000000000(),
      new ExtendVisitRequestStatusAndOutboxOccurredAt0930000000000(),
      new TemplateVersioningAndClosureGate0940000000000(),
      new CreateExecutionOrderEvidenceUploadIntents0950000000000(),
    ];
    for (const runner of runners) {
      for (const migrationStep of chain) {
        await expect(migrationStep.up(runner)).resolves.toBeUndefined();
      }
      const result = (await runner.query(
        `SELECT COUNT(*)::int AS count FROM access_permission_catalog`,
      )) as Array<{ count: number }>;
      expect(result[0]?.count).toBeGreaterThanOrEqual(7);
    }
  });
});
