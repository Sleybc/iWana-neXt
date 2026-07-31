import { randomBytes } from 'node:crypto';

import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { ExecutionOrderScheduleUnique0910000000000 } from './091_execution_order_schedule_unique';
import { ExtendVisitRequestStatusAndOutboxOccurredAt0930000000000 } from './093_extend_visit_request_status_and_outbox_occurred_at';
import { TemplateVersioningAndClosureGate0940000000000 } from './094_template_versioning_and_closure_gate';
import { AddExecutionOrderEvidenceCapturedAt0960000000000 } from './096_add_execution_order_evidence_captured_at';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const destructiveFlag = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';
const suffix = randomBytes(8).toString('hex');
const schemas = {
  schedule: `it_r24_schedule_${suffix}`,
  status: `it_r24_status_${suffix}`,
  templates: `it_r24_templates_${suffix}`,
  evidence: `it_r24_evidence_${suffix}`,
} as const;

type SchemaKey = keyof typeof schemas;

if (!dbAvailable) {
  console.warn(
    '[r2.4-down-integration] describe.skip activo — sin PostgreSQL real; no se ejecutan los down con datos.',
  );
}

describeWithDb('R2.4 down — PostgreSQL real en schemas aislados', () => {
  let dataSource: DataSource;
  const runners = new Map<SchemaKey, QueryRunner>();
  const originalFlag = process.env[destructiveFlag];

  async function runnerFor(key: SchemaKey): Promise<QueryRunner> {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.query(`SET search_path TO "${schemas[key]}"`);
    runners.set(key, runner);
    return runner;
  }

  async function columnExists(runner: QueryRunner, tableName: string, columnName: string) {
    const rows = (await runner.query(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = $1
           AND column_name = $2
       ) AS present`,
      [tableName, columnName],
    )) as Array<{ present: boolean }>;
    return rows[0]?.present === true;
  }

  async function withDestructiveFlag<T>(operation: () => Promise<T>): Promise<T> {
    process.env[destructiveFlag] = 'true';
    try {
      return await operation();
    } finally {
      delete process.env[destructiveFlag];
    }
  }

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
      extra: { max: 5, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();

    const bootstrap = dataSource.createQueryRunner();
    await bootstrap.connect();
    try {
      for (const schema of Object.values(schemas)) {
        await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await bootstrap.query(`CREATE SCHEMA "${schema}"`);
      }
    } finally {
      await bootstrap.release();
    }

    const schedule = await runnerFor('schedule');
    await schedule.query(`
      CREATE TABLE execution_orders (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        schedule_event_id UUID NOT NULL
      )
    `);
    await schedule.query(
      `CREATE INDEX idx_execution_orders_tenant_schedule_event
       ON execution_orders (tenant_id, schedule_event_id)`,
    );

    const status = await runnerFor('status');
    await status.query(`
      CREATE TYPE visit_request_status AS ENUM (
        'PENDING', 'NEEDS_CONTEXT', 'READY_TO_SCHEDULE', 'SCHEDULED',
        'CANCELLED', 'REJECTED', 'EXPIRED'
      )
    `);
    await status.query(`
      CREATE TABLE visit_requests (
        id UUID PRIMARY KEY,
        status visit_request_status NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      )
    `);
    await status.query(`
      CREATE TABLE execution_order_outbox_events (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        published_at TIMESTAMPTZ,
        available_at TIMESTAMPTZ NOT NULL,
        lease_until TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL
      )
    `);
    await status.query(
      `CREATE INDEX idx_execution_order_outbox_pending
       ON execution_order_outbox_events (tenant_id, published_at, available_at)`,
    );
    await status.query(`
      INSERT INTO execution_order_outbox_events
        (id, tenant_id, available_at, created_at)
      SELECT gen_random_uuid(), gen_random_uuid(), now(), now() - (n * interval '1 second')
      FROM generate_series(1, 1001) AS series(n)
    `);
    await status.query(
      `INSERT INTO visit_requests (id, status, created_at)
       VALUES (gen_random_uuid(), 'PENDING', now())`,
    );

    const templates = await runnerFor('templates');
    await templates.query(`CREATE TYPE wfm_work_type AS ENUM ('INSTALLATION')`);
    await templates.query(`
      CREATE TABLE execution_orders (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL
      )
    `);
    await templates.query(
      `CREATE TABLE execution_order_item_usage (id UUID PRIMARY KEY, tenant_id UUID NOT NULL)`,
    );
    await templates.query(
      `CREATE TABLE execution_order_evidence (id UUID PRIMARY KEY, tenant_id UUID NOT NULL)`,
    );

    const evidence = await runnerFor('evidence');
    await evidence.query(
      `CREATE TABLE execution_order_evidence (id UUID PRIMARY KEY, tenant_id UUID NOT NULL)`,
    );
  });

  afterAll(async () => {
    if (originalFlag === undefined) delete process.env[destructiveFlag];
    else process.env[destructiveFlag] = originalFlag;

    for (const runner of runners.values()) {
      await runner.release();
    }

    if (!dataSource?.isInitialized) return;
    const cleanup = dataSource.createQueryRunner();
    await cleanup.connect();
    try {
      for (const schema of Object.values(schemas)) {
        await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      }
    } finally {
      await cleanup.release();
      await dataSource.destroy();
    }
  });

  beforeEach(() => {
    delete process.env[destructiveFlag];
  });

  it('091 down restaura el índice no único anterior', async () => {
    const runner = runners.get('schedule');
    if (!runner) throw new Error('No existe QueryRunner para schedule');
    const migration = new ExecutionOrderScheduleUnique0910000000000();

    await migration.up(runner);
    const uniqueBeforeDown = (await runner.query(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema()
       AND indexname = 'uq_execution_orders_tenant_schedule_event'`,
    )) as Array<{ indexdef: string }>;
    expect(uniqueBeforeDown[0]?.indexdef).toContain('UNIQUE INDEX');

    await migration.down(runner);
    const restored = (await runner.query(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema()
       AND indexname = 'idx_execution_orders_tenant_schedule_event'`,
    )) as Array<{ indexdef: string }>;
    expect(restored[0]?.indexdef).toContain('tenant_id, schedule_event_id');
    expect(restored[0]?.indexdef).not.toContain('UNIQUE');
  });

  it('093 down con datos hace backfill por lotes y reconstruye el enum histórico', async () => {
    const runner = runners.get('status');
    if (!runner) throw new Error('No existe QueryRunner para status');
    const migration = new ExtendVisitRequestStatusAndOutboxOccurredAt0930000000000();

    await migration.up(runner);
    const backfillRows = (await runner.query(
      `SELECT COUNT(*)::int AS total
       FROM execution_order_outbox_events
       WHERE occurred_at IS NULL OR occurred_at <> created_at`,
    )) as Array<{ total: number }>;
    expect(backfillRows[0]?.total).toBe(0);

    await runner.query(
      `INSERT INTO visit_requests (id, status, created_at)
       VALUES (gen_random_uuid(), 'IN_EXECUTION', now())`,
    );
    await expect(migration.down(runner)).rejects.toThrow(/conserva 1 fila/);
    await runner.query(`DELETE FROM visit_requests WHERE status = 'IN_EXECUTION'`);

    await expect(migration.down(runner)).rejects.toThrow(
      /IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true/,
    );
    await withDestructiveFlag(() => migration.down(runner));

    expect(await columnExists(runner, 'execution_order_outbox_events', 'occurred_at')).toBe(false);
    const enumValues = (await runner.query(
      `SELECT enumlabel FROM pg_enum
       JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
       JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace
       WHERE pg_namespace.nspname = current_schema()
         AND pg_type.typname = 'visit_request_status'
       ORDER BY enumsortorder`,
    )) as Array<{ enumlabel: string }>;
    expect(enumValues.map((row) => row.enumlabel)).toEqual([
      'PENDING',
      'NEEDS_CONTEXT',
      'READY_TO_SCHEDULE',
      'SCHEDULED',
      'CANCELLED',
      'REJECTED',
      'EXPIRED',
    ]);
    const restored = (await runner.query(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema()
       AND indexname = 'idx_execution_order_outbox_pending'`,
    )) as Array<{ indexdef: string }>;
    expect(restored[0]?.indexdef).toContain('tenant_id, published_at, available_at');
  });

  it('094 down con tablas y columnas pobladas solo procede con el flag explícito', async () => {
    const runner = runners.get('templates');
    if (!runner) throw new Error('No existe QueryRunner para templates');
    const migration = new TemplateVersioningAndClosureGate0940000000000();

    await migration.up(runner);
    const templateId = '11111111-1111-1111-1111-111111111111';
    const versionId = '22222222-2222-2222-2222-222222222222';
    await runner.query(
      `INSERT INTO execution_order_templates (id, tenant_id, key, label, work_type)
       VALUES ($1, gen_random_uuid(), 'INSTALLATION', 'Installation', 'INSTALLATION')`,
      [templateId],
    );
    await runner.query(
      `INSERT INTO execution_order_template_versions
        (id, tenant_id, template_id, template_key, version, label)
       VALUES ($1, gen_random_uuid(), $2, 'INSTALLATION', 1, 'Version 1')`,
      [versionId, templateId],
    );
    await runner.query(
      `INSERT INTO execution_order_template_requirements
        (id, tenant_id, version_id, key, label, kind)
       VALUES (gen_random_uuid(), gen_random_uuid(), $1, 'photo', 'Photo', 'EVIDENCE')`,
      [versionId],
    );
    await runner.query(
      `INSERT INTO execution_orders (id, tenant_id, template_id, template_version_id,
        template_key, template_version_number, template_label, template_requirements_snapshot)
       VALUES (gen_random_uuid(), gen_random_uuid(), $1, $2, 'INSTALLATION', 1, 'Installation', '{}'::jsonb)`,
      [templateId, versionId],
    );
    await runner.query(
      `INSERT INTO execution_order_item_usage (id, tenant_id, inventory_request_id, movement_status)
       VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'PENDING')`,
    );
    await runner.query(
      `INSERT INTO execution_order_evidence
        (id, tenant_id, media_asset_id, requirement_key, asset_status)
       VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'photo', 'AVAILABLE')`,
    );

    await expect(migration.down(runner)).rejects.toThrow(/Reversión bloqueada/);
    await withDestructiveFlag(() => migration.down(runner));

    for (const tableName of [
      'execution_order_templates',
      'execution_order_template_versions',
      'execution_order_template_requirements',
    ]) {
      const rows = (await runner.query(`SELECT to_regclass($1) AS table_name`, [
        tableName,
      ])) as Array<{
        table_name: string | null;
      }>;
      expect(rows[0]?.table_name).toBeNull();
    }
    expect(await columnExists(runner, 'execution_orders', 'template_id')).toBe(false);
    expect(await columnExists(runner, 'execution_order_evidence', 'media_asset_id')).toBe(false);
    expect(await columnExists(runner, 'execution_order_item_usage', 'movement_status')).toBe(false);
  });

  it('096 down con captured_at poblado solo procede con el flag explícito', async () => {
    const runner = runners.get('evidence');
    if (!runner) throw new Error('No existe QueryRunner para evidence');
    const migration = new AddExecutionOrderEvidenceCapturedAt0960000000000();

    await migration.up(runner);
    await runner.query(
      `INSERT INTO execution_order_evidence (id, tenant_id, captured_at)
       VALUES (gen_random_uuid(), gen_random_uuid(), now())`,
    );
    await expect(migration.down(runner)).rejects.toThrow(
      /IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true/,
    );
    await withDestructiveFlag(() => migration.down(runner));
    expect(await columnExists(runner, 'execution_order_evidence', 'captured_at')).toBe(false);
  });
});
