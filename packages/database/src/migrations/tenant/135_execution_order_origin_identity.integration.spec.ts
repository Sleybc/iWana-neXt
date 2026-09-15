import { randomBytes } from 'node:crypto';

import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { ExecutionOrderOriginIdentity1350000000000 } from './135_execution_order_origin_identity';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const suffix = randomBytes(8).toString('hex');
const schema = `it_e1_origin_${suffix}`;

if (!dbAvailable) {
  console.warn(
    '[e1-origin-integration] describe.skip activo — sin PostgreSQL real; la migración 135 no se verifica.',
  );
}

/**
 * MOD11 E1 — migración 135 contra PostgreSQL real, ida y vuelta (CA-01, CA-02, CA-04).
 *
 * Un test con mocks de `queryRunner.query` solo comprueba que la cadena SQL
 * contiene un texto, no que la base la acepte: por eso esta suite crea la
 * tabla `execution_orders` en su forma pre-E1 dentro de un schema aislado y
 * ejecuta el `up`/`down` reales.
 */
describeWithDb('E1 migración 135 — Postgres real en schema aislado', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;
  const migration = new ExecutionOrderOriginIdentity1350000000000();

  const tenantId = '11111111-1111-4111-8111-111111111111';

  async function indexDef(indexName: string): Promise<string | null> {
    const rows = (await runner.query(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname = $1`,
      [indexName],
    )) as Array<{ indexdef: string }>;
    return rows[0]?.indexdef ?? null;
  }

  async function isNullable(columnName: string): Promise<boolean> {
    const rows = (await runner.query(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'execution_orders'
          AND column_name = $1`,
      [columnName],
    )) as Array<{ is_nullable: string }>;
    return rows[0]?.is_nullable === 'YES';
  }

  async function insertOrder(overrides: Record<string, string | null> = {}): Promise<string> {
    const id = randomBytes(16).toString('hex');
    // `in` y no `??`: un null explícito es el caso bajo prueba (OT sin evento),
    // no un valor ausente al que aplicar el default.
    const pick = (key: string, fallback: string | null): string | null =>
      key in overrides ? (overrides[key] as string | null) : fallback;
    await runner.query(
      `INSERT INTO execution_orders
         (id, tenant_id, execution_order_number, schedule_event_id, origin_context,
          origin_ref_id, work_type, work_summary, planned_window_start_at,
          planned_window_end_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        `00000000-0000-4000-8000-${id.slice(0, 12)}`,
        tenantId,
        pick('execution_order_number', `OTE-${id.slice(0, 8)}`),
        pick('schedule_event_id', '22222222-2222-4222-8222-222222222222'),
        pick('origin_context', 'ASSURANCE'),
        pick('origin_ref_id', 'TCK-E1-001'),
        pick('work_type', 'SUPPORT'),
        'Resumen de prueba',
        pick('planned_window_start_at', '2030-01-01T10:00:00.000Z'),
        pick('planned_window_end_at', '2030-01-01T11:00:00.000Z'),
        pick('status', 'ASSIGNED'),
      ],
    );
    return `00000000-0000-4000-8000-${id.slice(0, 12)}`;
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
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();

    const bootstrap = dataSource.createQueryRunner();
    await bootstrap.connect();
    try {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.query(`CREATE SCHEMA "${schema}"`);
    } finally {
      await bootstrap.release();
    }

    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.query(`SET search_path TO "${schema}"`);

    // Forma pre-E1: tres NOT NULL + índice único total por evento (091).
    await runner.query(`
      CREATE TABLE execution_orders (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        execution_order_number VARCHAR(40) NOT NULL,
        schedule_event_id UUID NOT NULL,
        origin_context VARCHAR(64) NOT NULL,
        origin_ref_id VARCHAR(160),
        work_type VARCHAR(32) NOT NULL,
        work_summary VARCHAR(200) NOT NULL,
        planned_window_start_at TIMESTAMPTZ NOT NULL,
        planned_window_end_at TIMESTAMPTZ NOT NULL,
        status VARCHAR(40) NOT NULL DEFAULT 'CREATED'
      )
    `);
    await runner.query(
      `CREATE UNIQUE INDEX uq_execution_orders_tenant_schedule_event
         ON execution_orders (tenant_id, schedule_event_id)`,
    );
  });

  afterAll(async () => {
    try {
      if (runner && !runner.isReleased) {
        await runner.query(`SET search_path TO public`);
        await runner.release();
      }
      if (dataSource?.isInitialized) {
        await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await dataSource.destroy();
      }
    } catch {
      // Limpieza best-effort sobre schema efímero.
    }
  });

  it('CA-01: up relaja las tres columnas y las OT existentes conservan su contenido', async () => {
    const before = (await runner.query(
      `SELECT id, schedule_event_id, planned_window_start_at, planned_window_end_at
         FROM execution_orders ORDER BY id`,
    )) as Array<Record<string, unknown>>;
    // Siembra dos OT agendadas pre-E1 con eventos distintos.
    await insertOrder({
      execution_order_number: 'OTE-CA01-A',
      schedule_event_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    await insertOrder({
      execution_order_number: 'OTE-CA01-B',
      schedule_event_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      origin_ref_id: 'TCK-E1-002',
    });
    void before;

    await migration.up(runner);

    expect(await isNullable('schedule_event_id')).toBe(true);
    expect(await isNullable('planned_window_start_at')).toBe(true);
    expect(await isNullable('planned_window_end_at')).toBe(true);

    const rows = (await runner.query(
      `SELECT execution_order_number, schedule_event_id::text AS schedule_event_id
         FROM execution_orders ORDER BY execution_order_number`,
    )) as Array<{ execution_order_number: string; schedule_event_id: string }>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      execution_order_number: 'OTE-CA01-A',
      schedule_event_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    expect(rows[1]).toMatchObject({
      execution_order_number: 'OTE-CA01-B',
      schedule_event_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });

    // Una OT sin evento ni ventana ya es expresable (E2 la creará; aquí el esquema la admite).
    await insertOrder({
      execution_order_number: 'OTE-CA01-C',
      schedule_event_id: null,
      origin_ref_id: 'TCK-E1-003',
      planned_window_start_at: null,
      planned_window_end_at: null,
    });
    const unscheduled = (await runner.query(
      `SELECT COUNT(*)::int AS total FROM execution_orders WHERE schedule_event_id IS NULL`,
    )) as Array<{ total: number }>;
    expect(unscheduled[0]?.total).toBe(1);
  });

  it('CA-02: el índice de origen deduplica activas y deja pasar terminales, nulos y distinto work_type', async () => {
    const originDef = await indexDef('uq_execution_orders_active_origin_unique');
    expect(originDef).toContain('tenant_id, origin_context, origin_ref_id, work_type');
    expect(originDef).toContain('WHERE');

    // Duplicada activa (mismo evento-distinto no importa: la clave es el origen).
    await expect(
      insertOrder({
        execution_order_number: 'OTE-CA02-DUP',
        schedule_event_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        origin_ref_id: 'TCK-E1-001',
        status: 'IN_PROGRESS',
      }),
    ).rejects.toMatchObject({ code: '23505' });

    // Mismo origen pero OT previa en estado terminal: no colisiona.
    await runner.query(
      `UPDATE execution_orders SET status = 'COMPLETED'
        WHERE execution_order_number = 'OTE-CA01-A'`,
    );
    await insertOrder({
      execution_order_number: 'OTE-CA02-REINSTALADA',
      schedule_event_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      origin_ref_id: 'TCK-E1-001',
      status: 'ASSIGNED',
    });

    // Mismo origen, distinto work_type: trabajo distinto, no colisiona.
    await insertOrder({
      execution_order_number: 'OTE-CA02-OTRO-TIPO',
      schedule_event_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      origin_ref_id: 'TCK-E1-002',
      work_type: 'INSTALLATION',
    });

    // origin_ref NULL: fuera de deduplicación (ADR-076 §D4).
    await insertOrder({
      execution_order_number: 'OTE-CA02-NULL-A',
      schedule_event_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      origin_ref_id: null,
    });
    await insertOrder({
      execution_order_number: 'OTE-CA02-NULL-B',
      schedule_event_id: '00000000-0000-4000-8000-000000000099',
      origin_ref_id: null,
    });

    // Dos OT sin evento coexisten bajo el índice parcial de evento.
    await insertOrder({
      execution_order_number: 'OTE-CA02-SIN-EVENTO',
      schedule_event_id: null,
      origin_ref_id: null,
      planned_window_start_at: null,
      planned_window_end_at: null,
    });
    const scheduleDef = await indexDef('uq_execution_orders_tenant_schedule_event');
    // pg_indexes parentiza el predicado: `WHERE (schedule_event_id IS NOT NULL)`.
    expect(scheduleDef).toMatch(/WHERE \(?schedule_event_id IS NOT NULL\)?/);
  });

  it('CA-04: down declara su límite ante OT sin evento y revierte limpio sin ellas', async () => {
    await expect(migration.down(runner)).rejects.toThrow(
      /Rollback de ExecutionOrderOriginIdentity bloqueado: [1-9]\d* OT\(s\) sin evento/,
    );

    // Sin OT sin evento ni ventana, el down restaura el estado 091.
    await runner.query(`DELETE FROM execution_orders WHERE schedule_event_id IS NULL`);
    await runner.query(
      `DELETE FROM execution_orders WHERE planned_window_start_at IS NULL OR planned_window_end_at IS NULL`,
    );
    await migration.down(runner);

    expect(await isNullable('schedule_event_id')).toBe(false);
    expect(await isNullable('planned_window_start_at')).toBe(false);
    expect(await isNullable('planned_window_end_at')).toBe(false);
    expect(await indexDef('uq_execution_orders_active_origin_unique')).toBeNull();
    const restored = await indexDef('uq_execution_orders_tenant_schedule_event');
    expect(restored).toContain('tenant_id, schedule_event_id');
    expect(restored).not.toContain('WHERE');
  });
});
