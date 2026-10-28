import type { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración tenant 165: normaliza interfaces y direcciones IPv4 locales sin
 * inferir datos de `lan_interface` ni cambiar redes existentes.
 */
export class CreateRouterInterfacesAndIpv4Addresses1650000000000 implements MigrationInterface {
  name = 'CreateRouterInterfacesAndIpv4Addresses1650000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_network_routers_tenant_id
        ON network_routers (tenant_id, id)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS network_router_interfaces (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        router_id uuid NOT NULL,
        name varchar(64) NOT NULL,
        kind varchar(16) NOT NULL,
        notes varchar(1000) NULL,
        status varchar(16) NOT NULL DEFAULT 'ACTIVE',
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        version integer NOT NULL DEFAULT 1,
        CONSTRAINT uq_network_router_interfaces_tenant_id UNIQUE (tenant_id, id),
        CONSTRAINT uq_network_router_interfaces_tenant_router_id UNIQUE (tenant_id, router_id, id),
        CONSTRAINT fk_network_router_interfaces_router
          FOREIGN KEY (tenant_id, router_id)
          REFERENCES network_routers(tenant_id, id)
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT ck_network_router_interfaces_kind
          CHECK (kind IN ('PHYSICAL', 'BRIDGE', 'VLAN', 'OTHER')),
        CONSTRAINT ck_network_router_interfaces_status
          CHECK (status IN ('ACTIVE', 'INACTIVE')),
        CONSTRAINT ck_network_router_interfaces_name
          CHECK (name = btrim(name) AND name <> ''),
        CONSTRAINT ck_network_router_interfaces_version CHECK (version >= 1)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_network_router_interfaces_name
        ON network_router_interfaces (tenant_id, router_id, lower(name))
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_network_router_interfaces_router
        ON network_router_interfaces (tenant_id, router_id, status, name, id)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS network_router_interface_ipv4_addresses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        router_id uuid NOT NULL,
        interface_id uuid NOT NULL,
        address inet NOT NULL,
        host_address inet GENERATED ALWAYS AS (set_masklen(address, 32)) STORED,
        notes varchar(1000) NULL,
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        version integer NOT NULL DEFAULT 1,
        CONSTRAINT fk_network_interface_ipv4_interface
          FOREIGN KEY (tenant_id, router_id, interface_id)
          REFERENCES network_router_interfaces(tenant_id, router_id, id)
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT ck_network_interface_ipv4_family CHECK (family(address) = 4),
        CONSTRAINT ck_network_interface_ipv4_prefix CHECK (masklen(address) BETWEEN 1 AND 32),
        CONSTRAINT ck_network_interface_ipv4_usable CHECK (
          host_address <> '0.0.0.0'::inet
          AND host_address <> '255.255.255.255'::inet
          AND NOT (host_address << '224.0.0.0/4'::inet)
          AND (
            masklen(address) > 30
            OR (
              host(address) <> host(network(address))
              AND host(address) <> host(broadcast(address))
            )
          )
        ),
        CONSTRAINT ck_network_interface_ipv4_version CHECK (version >= 1)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_network_interface_ipv4_address
        ON network_router_interface_ipv4_addresses
          (tenant_id, router_id, interface_id, host_address)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_network_interface_ipv4_host
        ON network_router_interface_ipv4_addresses (tenant_id, host_address)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_network_interface_ipv4_interface
        ON network_router_interface_ipv4_addresses (tenant_id, router_id, interface_id, id)
    `);

    await queryRunner.query(`
      ALTER TABLE ipv4_networks
        ADD COLUMN IF NOT EXISTS interface_id uuid NULL
    `);
    await queryRunner.query(`
      ALTER TABLE ipv4_networks
        ADD CONSTRAINT fk_ipv4_networks_router_tenant
        FOREIGN KEY (tenant_id, router_id)
        REFERENCES network_routers(tenant_id, id)
        ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID
    `);
    await queryRunner.query(`
      ALTER TABLE ipv4_networks
        ADD CONSTRAINT fk_ipv4_networks_interface
        FOREIGN KEY (tenant_id, router_id, interface_id)
        REFERENCES network_router_interfaces(tenant_id, router_id, id)
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ipv4_networks_interface
        ON ipv4_networks (tenant_id, interface_id)
        WHERE interface_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ipv4_networks_router_lock_order
        ON ipv4_networks (tenant_id, router_id, id)
    `);
    await queryRunner.query(`
      ALTER TABLE ipv4_networks
        ADD CONSTRAINT ck_ipv4_gateway_host
        CHECK (
          masklen(gateway) = 32
          AND host(gateway) <> host(network(cidr))
          AND host(gateway) <> host(broadcast(cidr))
        ) NOT VALID
    `);
    await queryRunner.query(`
      ALTER TABLE ipv4_networks
        ADD CONSTRAINT ck_ipv4_excluded_cardinality
        CHECK (cardinality(excluded_ips) <= 256) NOT VALID
    `);

    await queryRunner.query(`
      ALTER TABLE network_routers
        ADD COLUMN IF NOT EXISTS legacy_lan_interface_id uuid NULL
    `);
    await queryRunner.query(`
      ALTER TABLE network_routers
        ADD CONSTRAINT fk_network_routers_legacy_lan_interface
        FOREIGN KEY (tenant_id, id, legacy_lan_interface_id)
        REFERENCES network_router_interfaces(tenant_id, router_id, id)
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_network_routers_legacy_lan_interface
        ON network_routers (tenant_id, legacy_lan_interface_id)
        WHERE legacy_lan_interface_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.assertDestructiveDownAllowed(queryRunner);
    await queryRunner.query('DROP INDEX IF EXISTS idx_network_routers_legacy_lan_interface');
    await queryRunner.query(
      'ALTER TABLE IF EXISTS network_routers DROP CONSTRAINT IF EXISTS fk_network_routers_legacy_lan_interface',
    );
    await queryRunner.query(
      'ALTER TABLE IF EXISTS network_routers DROP COLUMN IF EXISTS legacy_lan_interface_id',
    );
    await queryRunner.query(
      'ALTER TABLE IF EXISTS ipv4_networks DROP CONSTRAINT IF EXISTS ck_ipv4_excluded_cardinality',
    );
    await queryRunner.query(
      'ALTER TABLE IF EXISTS ipv4_networks DROP CONSTRAINT IF EXISTS ck_ipv4_gateway_host',
    );
    await queryRunner.query('DROP INDEX IF EXISTS idx_ipv4_networks_router_lock_order');
    await queryRunner.query('DROP INDEX IF EXISTS idx_ipv4_networks_interface');
    await queryRunner.query(
      'ALTER TABLE IF EXISTS ipv4_networks DROP CONSTRAINT IF EXISTS fk_ipv4_networks_interface',
    );
    await queryRunner.query(
      'ALTER TABLE IF EXISTS ipv4_networks DROP CONSTRAINT IF EXISTS fk_ipv4_networks_router_tenant',
    );
    await queryRunner.query(
      'ALTER TABLE IF EXISTS ipv4_networks DROP COLUMN IF EXISTS interface_id',
    );
    await queryRunner.query('DROP INDEX IF EXISTS idx_network_interface_ipv4_interface');
    await queryRunner.query('DROP INDEX IF EXISTS idx_network_interface_ipv4_host');
    await queryRunner.query('DROP INDEX IF EXISTS uq_network_interface_ipv4_address');
    await queryRunner.query('DROP TABLE IF EXISTS network_router_interface_ipv4_addresses');
    await queryRunner.query('DROP INDEX IF EXISTS idx_network_router_interfaces_router');
    await queryRunner.query('DROP INDEX IF EXISTS uq_network_router_interfaces_name');
    await queryRunner.query('DROP TABLE IF EXISTS network_router_interfaces');
    await queryRunner.query('DROP INDEX IF EXISTS uq_network_routers_tenant_id');
  }

  private async assertDestructiveDownAllowed(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] === 'true') return;

    const populated: string[] = [];
    for (const table of ['network_router_interfaces', 'network_router_interface_ipv4_addresses']) {
      const relation = (await queryRunner.query('SELECT to_regclass($1) IS NOT NULL AS present', [
        table,
      ])) as Array<{ present: boolean }>;
      if (relation[0]?.present !== true) continue;
      const count = (await queryRunner.query(
        `SELECT COUNT(*)::int AS total FROM ${table}`,
      )) as Array<{ total: number }>;
      if ((count[0]?.total ?? 0) > 0) populated.push(`${table}=${count[0]?.total ?? 0}`);
    }

    for (const [table, column] of [
      ['network_routers', 'legacy_lan_interface_id'],
      ['ipv4_networks', 'interface_id'],
    ] as const) {
      const columnExists = (await queryRunner.query(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2
         ) AS present`,
        [table, column],
      )) as Array<{ present: boolean }>;
      if (columnExists[0]?.present !== true) continue;
      const references = (await queryRunner.query(
        `SELECT COUNT(*)::int AS total FROM ${table} WHERE ${column} IS NOT NULL`,
      )) as Array<{ total: number }>;
      if ((references[0]?.total ?? 0) > 0) {
        populated.push(`${table}.${column}=${references[0]?.total ?? 0}`);
      }
    }

    if (populated.length > 0) {
      throw new Error(
        `Rollback de MOD13 interfaces bloqueado: hay datos o referencias (${populated.join(', ')}). ` +
          `Para continuar de forma destructiva, exporte ${DESTRUCTIVE_DOWN_ENV_VAR} de forma explícita.`,
      );
    }
  }
}
