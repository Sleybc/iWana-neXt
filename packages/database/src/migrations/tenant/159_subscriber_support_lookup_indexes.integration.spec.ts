import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { AddSubscriberSupportLookupIndexes1590000000000 } from './159_subscriber_support_lookup_indexes';

const SCHEMA = `tenant_mod05_support_159_${randomBytes(4).toString('hex')}`;
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración 159: DB_NAME debe ser dbiw, test o iwana_it_*; solo crea y limpia un schema efímero.',
  );
}

function requireRunner(runner: QueryRunner | undefined): QueryRunner {
  if (!runner) throw new Error('QueryRunner de integración no inicializado.');
  return runner;
}

describeWithDb('Migración 159 — índices de consulta de soporte en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const migration = new AddSubscriberSupportLookupIndexes1590000000000();

  async function expectNoSupportIndexes(): Promise<void> {
    const indexes = (await requireRunner(runner).query(`
      SELECT indexname FROM pg_indexes
       WHERE schemaname = current_schema()
         AND indexname IN (
           'idx_support_tickets_tenant_requester_subscriber',
           'idx_support_tickets_tenant_subject',
           'idx_visit_requests_tenant_subscriber',
           'idx_visit_requests_tenant_expediente',
           'idx_schedule_events_tenant_subscriber'
         )
       ORDER BY indexname
    `)) as Array<{ indexname: string }>;
    expect(indexes).toEqual([]);
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
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();

    const bootstrap = dataSource.createQueryRunner();
    await bootstrap.connect();
    try {
      await bootstrap.query(`CREATE SCHEMA "${SCHEMA}"`);
    } finally {
      await bootstrap.release();
    }

    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.query(`SET search_path TO "${SCHEMA}"`);
    await runner.query(
      'CREATE TABLE support_tickets (tenant_id uuid, requester_type text, requester_ref_id uuid, subject_type text, subject_ref_id uuid)',
    );
    await runner.query(
      'CREATE TABLE visit_requests (tenant_id uuid, subscriber_id uuid, expediente_id uuid, deleted_at timestamptz)',
    );
    await runner.query('CREATE TABLE schedule_events (tenant_id uuid, subscriber_id uuid)');
  });

  beforeEach(async () => {
    await requireRunner(runner).query('TRUNCATE support_tickets, visit_requests, schedule_events');
  });

  afterEach(async () => {
    await migration.down(requireRunner(runner));
  });

  afterAll(async () => {
    try {
      if (runner && !runner.isReleased) {
        await runner.release();
      }
    } finally {
      if (dataSource?.isInitialized) {
        try {
          await dataSource.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
        } finally {
          await dataSource.destroy();
        }
      }
    }
  });

  it('up crea los cinco índices aditivos con las columnas y predicados esperados', async () => {
    const active = requireRunner(runner);
    await migration.up(active);

    const indexes = (await active.query(`
      SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = current_schema()
         AND indexname IN (
           'idx_support_tickets_tenant_requester_subscriber',
           'idx_support_tickets_tenant_subject',
           'idx_visit_requests_tenant_subscriber',
           'idx_visit_requests_tenant_expediente',
           'idx_schedule_events_tenant_subscriber'
         )
       ORDER BY indexname
    `)) as Array<{ indexname: string; indexdef: string }>;

    expect(indexes).toHaveLength(5);
    expect(indexes).toEqual(
      expect.arrayContaining([
        {
          indexname: 'idx_support_tickets_tenant_requester_subscriber',
          indexdef: expect.stringMatching(
            /\(tenant_id, requester_ref_id\).*WHERE \(requester_type = 'SUBSCRIBER'::text\)/u,
          ),
        },
        {
          indexname: 'idx_support_tickets_tenant_subject',
          indexdef: expect.stringMatching(/\(tenant_id, subject_type, subject_ref_id\)/u),
        },
        {
          indexname: 'idx_visit_requests_tenant_subscriber',
          indexdef: expect.stringMatching(/\(tenant_id, subscriber_id\)/u),
        },
        {
          indexname: 'idx_visit_requests_tenant_expediente',
          indexdef: expect.stringMatching(
            /\(tenant_id, expediente_id\).*WHERE.*expediente_id IS NOT NULL.*deleted_at IS NULL/u,
          ),
        },
        {
          indexname: 'idx_schedule_events_tenant_subscriber',
          indexdef: expect.stringMatching(/\(tenant_id, subscriber_id\)/u),
        },
      ]),
    );

    const ticketTenant = randomUUID();
    const subscriber = randomUUID();
    await active.query(
      `INSERT INTO support_tickets (tenant_id, requester_type, requester_ref_id, subject_type, subject_ref_id)
       VALUES ($1, 'SUBSCRIBER', $2, 'SUBSCRIBER', $2)`,
      [ticketTenant, subscriber],
    );
    await active.query('INSERT INTO visit_requests (tenant_id, subscriber_id) VALUES ($1, $2)', [
      ticketTenant,
      subscriber,
    ]);
    await active.query('INSERT INTO schedule_events (tenant_id, subscriber_id) VALUES ($1, $2)', [
      ticketTenant,
      subscriber,
    ]);
  });

  it('down retira los cinco índices y conserva tablas y filas preexistentes', async () => {
    const active = requireRunner(runner);
    await migration.up(active);
    const tenantId = randomUUID();
    const subscriberId = randomUUID();
    await active.query('INSERT INTO visit_requests (tenant_id, subscriber_id) VALUES ($1, $2)', [
      tenantId,
      subscriberId,
    ]);
    await active.query(
      `INSERT INTO support_tickets (tenant_id, requester_type, requester_ref_id, subject_type, subject_ref_id)
       VALUES ($1, 'SUBSCRIBER', $2, 'SUBSCRIBER', $2)`,
      [tenantId, subscriberId],
    );
    await active.query('INSERT INTO schedule_events (tenant_id, subscriber_id) VALUES ($1, $2)', [
      tenantId,
      subscriberId,
    ]);

    await migration.down(active);

    await expectNoSupportIndexes();
    await expect(active.query('SELECT subscriber_id FROM visit_requests')).resolves.toEqual([
      { subscriber_id: subscriberId },
    ]);
    await expect(
      active.query('SELECT COUNT(*)::int AS total FROM support_tickets'),
    ).resolves.toEqual([{ total: 1 }]);
    await expect(
      active.query('SELECT COUNT(*)::int AS total FROM schedule_events'),
    ).resolves.toEqual([{ total: 1 }]);
  });
});
