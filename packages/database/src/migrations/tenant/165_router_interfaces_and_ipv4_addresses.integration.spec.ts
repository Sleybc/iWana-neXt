import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { EnableBtreeGist1784419216000 } from '../public/028_enable_btree_gist';
import { CreateNetworkCatalog1600000000000 } from './160_network_catalog';
import { CreateRouterInterfacesAndIpv4Addresses1650000000000 } from './165_router_interfaces_and_ipv4_addresses';

const SCHEMA = `tenant_mod13_interfaces_165_${randomBytes(4).toString('hex')}`;
const DB_AVAILABLE = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = DB_AVAILABLE ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;
const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

if (DB_AVAILABLE && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración 165: DB_NAME debe ser dbiw, test o iwana_it_*; solo crea y limpia un schema efímero.',
  );
}

function requireRunner(runner: QueryRunner | undefined): QueryRunner {
  if (!runner) throw new Error('QueryRunner de integración no inicializado.');
  return runner;
}

describeWithDb('Migración 165 — interfaces y direcciones IPv4 en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const btreeGistMigration = new EnableBtreeGist1784419216000();
  const catalogMigration = new CreateNetworkCatalog1600000000000();
  const migration = new CreateRouterInterfacesAndIpv4Addresses1650000000000();
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
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
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

  it('aplica up/down/up real y bloquea down con datos o asociaciones pobladas', async () => {
    const active = requireRunner(runner);
    const legacyTenantId = randomUUID();
    const legacyActorId = randomUUID();
    const legacyRouterRows = (await active.query(
      `INSERT INTO network_routers
         (tenant_id, name, management_host, lan_interface, supported_control_methods, created_by)
       VALUES ($1, 'Router legacy', 'legacy-router.invalid', 'ether-legacy',
               ARRAY['SIMPLE_QUEUE_STATIC_IP'], $2)
       RETURNING id`,
      [legacyTenantId, legacyActorId],
    )) as Array<{ id: string }>;
    const legacyRouterId = legacyRouterRows[0]?.id;
    if (!legacyRouterId) throw new Error('El fixture legacy no creó el router.');
    const legacyNetworkRows = (await active.query(
      `INSERT INTO ipv4_networks
         (tenant_id, router_id, name, cidr, gateway, assignable_from, assignable_to,
          default_control_method, created_by)
       VALUES ($1, $2, 'Pool legacy', '192.0.2.0/24', '192.0.2.1', '192.0.2.10', '192.0.2.200',
               'SIMPLE_QUEUE_STATIC_IP', $3)
       RETURNING id`,
      [legacyTenantId, legacyRouterId, legacyActorId],
    )) as Array<{ id: string }>;
    const legacyNetworkId = legacyNetworkRows[0]?.id;
    if (!legacyNetworkId) throw new Error('El fixture legacy no creó la red.');
    const legacyBeforeRows = (await active.query(
      `SELECT to_jsonb(router) AS router, to_jsonb(network) AS network
         FROM network_routers router
         JOIN ipv4_networks network ON network.router_id = router.id
        WHERE router.id = $1 AND network.id = $2`,
      [legacyRouterId, legacyNetworkId],
    )) as Array<{ router: Record<string, unknown>; network: Record<string, unknown> }>;
    const legacyBefore = legacyBeforeRows[0];
    if (!legacyBefore) throw new Error('No se pudo capturar el baseline legacy.');

    await migration.up(active);
    const legacyAfterUpRows = (await active.query(
      `SELECT to_jsonb(router) - 'legacy_lan_interface_id' AS router,
              to_jsonb(network) - 'interface_id' AS network,
              router.legacy_lan_interface_id IS NULL AS legacy_reference_null,
              network.interface_id IS NULL AS network_reference_null,
              (SELECT COUNT(*)::int FROM network_router_interfaces WHERE router_id = router.id)
                AS inferred_interfaces
         FROM network_routers router
         JOIN ipv4_networks network ON network.router_id = router.id
        WHERE router.id = $1 AND network.id = $2`,
      [legacyRouterId, legacyNetworkId],
    )) as Array<{
      router: Record<string, unknown>;
      network: Record<string, unknown>;
      legacy_reference_null: boolean;
      network_reference_null: boolean;
      inferred_interfaces: number;
    }>;
    expect(legacyAfterUpRows[0]).toEqual({
      ...legacyBefore,
      legacy_reference_null: true,
      network_reference_null: true,
      inferred_interfaces: 0,
    });

    const tenantId = randomUUID();
    const actorId = randomUUID();

    const routerRows = (await active.query(
      `INSERT INTO network_routers
         (tenant_id, name, management_host, supported_control_methods, created_by)
       VALUES ($1, 'Router de integración', 'router.invalid', ARRAY['SIMPLE_QUEUE_STATIC_IP'], $2)
       RETURNING id`,
      [tenantId, actorId],
    )) as Array<{ id: string }>;
    const routerId = routerRows[0]?.id;
    if (!routerId) throw new Error('El fixture no creó el router.');

    const networkRows = (await active.query(
      `INSERT INTO ipv4_networks
         (tenant_id, router_id, name, cidr, gateway, assignable_from, assignable_to,
          default_control_method, created_by)
       VALUES ($1, $2, 'Pool de integración', '10.20.0.0/24', '10.20.0.1', '10.20.0.10', '10.20.0.200',
               'SIMPLE_QUEUE_STATIC_IP', $3)
       RETURNING id`,
      [tenantId, routerId, actorId],
    )) as Array<{ id: string }>;
    const networkId = networkRows[0]?.id;
    if (!networkId) throw new Error('El fixture no creó la red.');

    const interfaceRows = (await active.query(
      `INSERT INTO network_router_interfaces (tenant_id, router_id, name, kind, created_by)
       VALUES ($1, $2, 'ether1', 'PHYSICAL', $3) RETURNING id`,
      [tenantId, routerId, actorId],
    )) as Array<{ id: string }>;
    const interfaceId = interfaceRows[0]?.id;
    if (!interfaceId) throw new Error('El fixture no creó la interfaz.');

    await active.query(
      `INSERT INTO network_router_interface_ipv4_addresses
         (tenant_id, router_id, interface_id, address, created_by)
       VALUES ($1, $2, $3, '10.20.0.2/32', $4)`,
      [tenantId, routerId, interfaceId, actorId],
    );
    await active.query('UPDATE ipv4_networks SET interface_id = $1 WHERE id = $2', [
      interfaceId,
      networkId,
    ]);
    await active.query('UPDATE network_routers SET legacy_lan_interface_id = $1 WHERE id = $2', [
      interfaceId,
      routerId,
    ]);

    delete process.env[DESTRUCTIVE_DOWN_ENV_VAR];
    await expect(migration.down(active)).rejects.toThrow(/Rollback de MOD13 interfaces bloqueado/u);
    const protectedData = (await active.query(
      `SELECT
         (SELECT COUNT(*)::int FROM network_router_interfaces) AS interfaces,
         (SELECT COUNT(*)::int FROM network_router_interface_ipv4_addresses) AS addresses,
         (SELECT interface_id IS NOT NULL FROM ipv4_networks WHERE id = $1) AS network_reference,
         (SELECT legacy_lan_interface_id IS NOT NULL FROM network_routers WHERE id = $2) AS router_reference`,
      [networkId, routerId],
    )) as Array<{
      interfaces: number;
      addresses: number;
      network_reference: boolean;
      router_reference: boolean;
    }>;
    expect(protectedData[0]).toEqual({
      interfaces: 1,
      addresses: 1,
      network_reference: true,
      router_reference: true,
    });

    await active.query('UPDATE ipv4_networks SET interface_id = NULL WHERE id = $1', [networkId]);
    await active.query('UPDATE network_routers SET legacy_lan_interface_id = NULL WHERE id = $1', [
      routerId,
    ]);
    await active.query('DELETE FROM network_router_interface_ipv4_addresses');
    await active.query('DELETE FROM network_router_interfaces');
    await migration.down(active);
    const legacyAfterDownRows = (await active.query(
      `SELECT to_jsonb(router) AS router, to_jsonb(network) AS network
         FROM network_routers router
         JOIN ipv4_networks network ON network.router_id = router.id
        WHERE router.id = $1 AND network.id = $2`,
      [legacyRouterId, legacyNetworkId],
    )) as Array<{ router: Record<string, unknown>; network: Record<string, unknown> }>;
    expect(legacyAfterDownRows[0]).toEqual(legacyBefore);

    const downState = (await active.query(
      `SELECT to_regclass('network_router_interfaces') IS NULL AS interfaces_absent,
              EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_schema = current_schema() AND table_name = 'ipv4_networks'
                   AND column_name = 'interface_id'
              ) AS pool_column_present,
              EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_schema = current_schema() AND table_name = 'network_routers'
                   AND column_name = 'legacy_lan_interface_id'
              ) AS legacy_column_present`,
    )) as Array<{
      interfaces_absent: boolean;
      pool_column_present: boolean;
      legacy_column_present: boolean;
    }>;
    expect(downState[0]).toEqual({
      interfaces_absent: true,
      pool_column_present: false,
      legacy_column_present: false,
    });

    await migration.up(active);
    const upAgain = (await active.query(
      `SELECT to_regclass('network_router_interfaces') IS NOT NULL AS interfaces_present,
              to_regclass('network_router_interface_ipv4_addresses') IS NOT NULL AS addresses_present`,
    )) as Array<{ interfaces_present: boolean; addresses_present: boolean }>;
    expect(upAgain[0]).toEqual({ interfaces_present: true, addresses_present: true });
    const legacyAfterUpAgainRows = (await active.query(
      `SELECT to_jsonb(router) - 'legacy_lan_interface_id' AS router,
              to_jsonb(network) - 'interface_id' AS network,
              router.legacy_lan_interface_id IS NULL AS legacy_reference_null,
              network.interface_id IS NULL AS network_reference_null,
              (SELECT COUNT(*)::int FROM network_router_interfaces WHERE router_id = router.id)
                AS inferred_interfaces
         FROM network_routers router
         JOIN ipv4_networks network ON network.router_id = router.id
        WHERE router.id = $1 AND network.id = $2`,
      [legacyRouterId, legacyNetworkId],
    )) as Array<{
      router: Record<string, unknown>;
      network: Record<string, unknown>;
      legacy_reference_null: boolean;
      network_reference_null: boolean;
      inferred_interfaces: number;
    }>;
    expect(legacyAfterUpAgainRows[0]).toEqual({
      ...legacyBefore,
      legacy_reference_null: true,
      network_reference_null: true,
      inferred_interfaces: 0,
    });
  });
});
