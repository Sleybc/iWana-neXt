import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { EnableBtreeGist1784419216000 } from '../public/028_enable_btree_gist';
import { CreateNetworkCatalog1600000000000 } from './160_network_catalog';

const SCHEMA = `tenant_network_catalog_160_${randomBytes(4).toString('hex')}`;
const DB_AVAILABLE = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = DB_AVAILABLE ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;
const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

if (DB_AVAILABLE && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración 160: DB_NAME debe ser dbiw, test o iwana_it_*; solo crea y limpia un schema efímero.',
  );
}

function requireRunner(runner: QueryRunner | undefined): QueryRunner {
  if (!runner) throw new Error('QueryRunner de integración no inicializado.');
  return runner;
}

describeWithDb('Migración 160 — catálogo de red en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const migration = new CreateNetworkCatalog1600000000000();
  const btreeGistMigration = new EnableBtreeGist1784419216000();
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

  it('crea el catálogo, protege reglas IPv4 y revierte explícitamente sus datos', async () => {
    const active = requireRunner(runner);
    const tenantId = randomUUID();
    const actorId = randomUUID();
    await migration.up(active);

    const tables = (await active.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [[...['network_routers', 'ipv4_networks', 'network_plan_profiles', 'network_settings']]],
    )) as Array<{ table_name: string }>;
    expect(tables.map(({ table_name }) => table_name)).toEqual([
      'ipv4_networks',
      'network_plan_profiles',
      'network_routers',
      'network_settings',
    ]);

    const routerRows = (await active.query(
      `INSERT INTO network_routers
         (tenant_id, name, management_host, supported_control_methods, created_by)
       VALUES ($1, 'Router principal', 'router.invalid', ARRAY['SIMPLE_QUEUE_STATIC_IP'], $2)
       RETURNING id`,
      [tenantId, actorId],
    )) as Array<{ id: string }>;
    const routerId = routerRows[0]?.id;
    if (!routerId) throw new Error('El fixture no creó el router.');

    await expect(
      active.query(
        `INSERT INTO ipv4_networks
           (tenant_id, router_id, name, cidr, gateway, assignable_from, assignable_to,
            default_control_method, created_by)
         VALUES ($1, $2, 'Red inválida', '10.20.0.0/24', '10.20.0.1', '10.20.0.20', '10.20.0.10',
                 'SIMPLE_QUEUE_STATIC_IP', $3)`,
        [tenantId, routerId, actorId],
      ),
    ).rejects.toThrow();

    await active.query(
      `INSERT INTO ipv4_networks
         (tenant_id, router_id, name, cidr, gateway, assignable_from, assignable_to,
          default_control_method, created_by)
       VALUES ($1, $2, 'Red principal', '10.20.0.0/24', '10.20.0.1', '10.20.0.10', '10.20.0.200',
               'SIMPLE_QUEUE_STATIC_IP', $3)`,
      [tenantId, routerId, actorId],
    );

    await expect(
      active.query(
        `INSERT INTO ipv4_networks
           (tenant_id, router_id, name, cidr, gateway, assignable_from, assignable_to,
            default_control_method, created_by)
         VALUES ($1, $2, 'Red solapada', '10.20.0.128/25', '10.20.0.129', '10.20.0.130', '10.20.0.200',
                 'SIMPLE_QUEUE_STATIC_IP', $3)`,
        [tenantId, routerId, actorId],
      ),
    ).rejects.toThrow();

    await active.query(
      `INSERT INTO ipv4_networks
         (tenant_id, router_id, name, cidr, gateway, assignable_from, assignable_to,
          default_control_method, created_by)
       VALUES ($1, $2, 'Red mismo rango de otro tenant', '10.20.0.0/24', '10.20.0.1', '10.20.0.10', '10.20.0.200',
               'SIMPLE_QUEUE_STATIC_IP', $3)`,
      [randomUUID(), routerId, actorId],
    );

    delete process.env[DESTRUCTIVE_DOWN_ENV_VAR];
    await expect(migration.down(active)).rejects.toThrow(
      /IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true/u,
    );
    process.env[DESTRUCTIVE_DOWN_ENV_VAR] = 'true';
    await migration.down(active);

    const remainingTables = (await active.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
      [[...['network_routers', 'ipv4_networks', 'network_plan_profiles', 'network_settings']]],
    )) as Array<{ table_name: string }>;
    expect(remainingTables).toEqual([]);
  });
});
