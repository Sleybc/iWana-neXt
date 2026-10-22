import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { EnableBtreeGist1784419216000 } from '../public/028_enable_btree_gist';
import { CreateNetworkCatalog1600000000000 } from './160_network_catalog';
import { CreateNetworkProvisioning1610000000000 } from './161_network_provisioning';

const SCHEMA = `tenant_network_provisioning_161_${randomBytes(4).toString('hex')}`;
const DB_AVAILABLE = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = DB_AVAILABLE ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;
const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

if (DB_AVAILABLE && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración 161: DB_NAME debe ser dbiw, test o iwana_it_*; solo crea y limpia un schema efímero.',
  );
}

function requireRunner(runner: QueryRunner | undefined): QueryRunner {
  if (!runner) throw new Error('QueryRunner de integración no inicializado.');
  return runner;
}

describeWithDb('Migración 161 — aprovisionamiento e IPAM en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const btreeGistMigration = new EnableBtreeGist1784419216000();
  const catalogMigration = new CreateNetworkCatalog1600000000000();
  const migration = new CreateNetworkProvisioning1610000000000();
  const originalFlag = process.env[DESTRUCTIVE_DOWN_ENV_VAR];

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'dbiw',
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
      await btreeGistMigration.up(bootstrap);
      await bootstrap.query(`CREATE SCHEMA "${SCHEMA}"`);
    } finally {
      await bootstrap.release();
    }

    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.query(`SET search_path TO "${SCHEMA}"`);
    await catalogMigration.up(runner);
  });

  afterAll(async () => {
    if (originalFlag === undefined) delete process.env[DESTRUCTIVE_DOWN_ENV_VAR];
    else process.env[DESTRUCTIVE_DOWN_ENV_VAR] = originalFlag;
    try {
      if (runner && !runner.isReleased) await runner.release();
    } finally {
      if (dataSource?.isInitialized) {
        const cleanup = dataSource.createQueryRunner();
        try {
          await cleanup.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
        } finally {
          await cleanup.release();
          await dataSource.destroy();
        }
      }
    }
  });

  it('crea las tablas, aplica unicidad e integridad y revierte en orden', async () => {
    const active = requireRunner(runner);
    const tenantId = randomUUID();
    const actorId = randomUUID();
    const subscriberId = randomUUID();
    const executionOrderId = randomUUID();
    const eventId = randomUUID();
    await migration.up(active);

    const routerRows = (await active.query(
      `INSERT INTO network_routers
         (tenant_id, name, management_host, supported_control_methods, created_by)
       VALUES ($1, 'Router de prueba', 'router.invalid', ARRAY['SIMPLE_QUEUE_STATIC_IP'], $2)
       RETURNING id`,
      [tenantId, actorId],
    )) as Array<{ id: string }>;
    const routerId = routerRows[0]?.id;
    if (!routerId) throw new Error('El fixture no creó el router.');

    const networkRows = (await active.query(
      `INSERT INTO ipv4_networks
         (tenant_id, router_id, name, cidr, gateway, assignable_from, assignable_to,
          default_control_method, created_by)
       VALUES ($1, $2, 'Pool de prueba', '10.30.0.0/24', '10.30.0.1', '10.30.0.10', '10.30.0.200',
               'SIMPLE_QUEUE_STATIC_IP', $3)
       RETURNING id`,
      [tenantId, routerId, actorId],
    )) as Array<{ id: string }>;
    const networkId = networkRows[0]?.id;
    if (!networkId) throw new Error('El fixture no creó la red IPv4.');

    const provisioningRows = (await active.query(
      `INSERT INTO service_provisionings
         (tenant_id, subscriber_id, execution_order_id, execution_order_number, router_id, ipv4_network_id,
          control_method, control_params, status)
       VALUES ($1, $2, $3, 'OTE-TEST-161', $4, $5, 'SIMPLE_QUEUE_STATIC_IP', '{"method":"SIMPLE_QUEUE_STATIC_IP"}', 'RESERVED')
       RETURNING id`,
      [tenantId, subscriberId, executionOrderId, routerId, networkId],
    )) as Array<{ id: string }>;
    const provisioningId = provisioningRows[0]?.id;
    if (!provisioningId) throw new Error('El fixture no creó el aprovisionamiento.');

    const provisioningColumns = (await active.query(
      `SELECT column_name, data_type, character_maximum_length, is_nullable
       FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'service_provisionings'
         AND column_name = ANY($1::text[])
       ORDER BY column_name`,
      [['execution_order_number', 'regularized_by', 'regularized_at', 'released_by']],
    )) as Array<{
      column_name: string;
      data_type: string;
      character_maximum_length: number | null;
      is_nullable: string;
    }>;
    expect(provisioningColumns).toEqual([
      {
        column_name: 'execution_order_number',
        data_type: 'character varying',
        character_maximum_length: 40,
        is_nullable: 'NO',
      },
      {
        column_name: 'regularized_at',
        data_type: 'timestamp with time zone',
        character_maximum_length: null,
        is_nullable: 'YES',
      },
      {
        column_name: 'regularized_by',
        data_type: 'uuid',
        character_maximum_length: null,
        is_nullable: 'YES',
      },
      {
        column_name: 'released_by',
        data_type: 'uuid',
        character_maximum_length: null,
        is_nullable: 'YES',
      },
    ]);

    await expect(
      active.query(
        `INSERT INTO service_provisionings
           (tenant_id, subscriber_id, execution_order_id, execution_order_number, router_id,
            ipv4_network_id, control_method, control_params, status, origin, regularization_reason)
         VALUES ($1, $2, $3, 'OTE-TEST-REGULARIZED', $4, $5, 'SIMPLE_QUEUE_STATIC_IP',
                 '{"method":"SIMPLE_QUEUE_STATIC_IP"}', 'ACTIVE', 'REGULARIZED', 'Fixture de prueba')`,
        [tenantId, subscriberId, randomUUID(), routerId, networkId],
      ),
    ).rejects.toThrow();

    const assignmentRows = (await active.query(
      `INSERT INTO ip_assignments
         (tenant_id, ipv4_network_id, ip, service_provisioning_id, status)
       VALUES ($1, $2, '10.30.0.10/32', $3, 'RESERVED')
       RETURNING id`,
      [tenantId, networkId, provisioningId],
    )) as Array<{ id: string }>;
    const assignmentId = assignmentRows[0]?.id;
    if (!assignmentId) throw new Error('El fixture no creó la asignación IP.');
    await active.query('UPDATE service_provisionings SET ip_assignment_id = $1 WHERE id = $2', [
      assignmentId,
      provisioningId,
    ]);

    await expect(
      active.query(
        `INSERT INTO ip_assignments
           (tenant_id, ipv4_network_id, ip, service_provisioning_id, status)
         VALUES ($1, $2, '10.30.0.10/32', $3, 'ACTIVE')`,
        [tenantId, networkId, provisioningId],
      ),
    ).rejects.toThrow();

    await active.query(
      `INSERT INTO network_inbox_events
         (tenant_id, event_id, event_type, execution_order_id, last_error_code)
       VALUES ($1, $2, 'ExecutionOrderClosed', $3, 'CRM_LISTENER_FAILED')`,
      [tenantId, eventId, executionOrderId],
    );
    expect(
      await active.query(
        `SELECT data_type, character_maximum_length
         FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'network_inbox_events'
           AND column_name = 'last_error_code'`,
      ),
    ).toEqual([{ data_type: 'character varying', character_maximum_length: 64 }]);
    expect(
      await active.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'network_inbox_events'
           AND column_name = 'last_error'`,
      ),
    ).toEqual([]);
    await expect(
      active.query(
        `INSERT INTO network_inbox_events (tenant_id, event_id, event_type, execution_order_id)
         VALUES ($1, $2, 'ExecutionOrderClosed', $3)`,
        [tenantId, eventId, executionOrderId],
      ),
    ).rejects.toThrow();

    delete process.env[DESTRUCTIVE_DOWN_ENV_VAR];
    await expect(migration.down(active)).rejects.toThrow(
      /IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true/u,
    );
    process.env[DESTRUCTIVE_DOWN_ENV_VAR] = 'true';
    await migration.down(active);

    const remainingProvisioningTables = (await active.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema()
         AND table_name = ANY($1::text[])`,
      [['service_provisionings', 'ip_assignments', 'network_inbox_events']],
    )) as Array<{ table_name: string }>;
    expect(remainingProvisioningTables).toEqual([]);

    await catalogMigration.down(active);
  });
});
