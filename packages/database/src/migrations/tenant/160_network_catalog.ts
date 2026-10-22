import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';
const CREATED_TABLES = [
  'network_routers',
  'ipv4_networks',
  'network_plan_profiles',
  'network_settings',
] as const;

/** Migración tenant 160: catálogo de routers, redes IPv4, perfiles de plan y ajuste de aprovisionamiento. */
export class CreateNetworkCatalog1600000000000 implements MigrationInterface {
  name = 'CreateNetworkCatalog1600000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS network_routers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        name varchar(120) NOT NULL,
        organization_site_id uuid NULL,
        commercial_node_id uuid NULL,
        management_host varchar(255) NOT NULL,
        lan_interface varchar(64) NULL,
        supported_control_methods varchar(40)[] NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'ACTIVE',
        notes text NULL,
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        version integer NOT NULL DEFAULT 1,
        CONSTRAINT ck_network_routers_methods CHECK (cardinality(supported_control_methods) >= 1),
        CONSTRAINT ck_network_routers_status CHECK (status IN ('ACTIVE', 'INACTIVE'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_network_routers_tenant_name
        ON network_routers (tenant_id, lower(name))
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ipv4_networks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        router_id uuid NOT NULL REFERENCES network_routers(id),
        name varchar(120) NOT NULL,
        cidr cidr NOT NULL,
        gateway inet NOT NULL,
        assignable_from inet NOT NULL,
        assignable_to inet NOT NULL,
        excluded_ips inet[] NOT NULL DEFAULT '{}',
        default_control_method varchar(40) NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'ACTIVE',
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        version integer NOT NULL DEFAULT 1,
        CONSTRAINT ck_ipv4_family CHECK (family(cidr) = 4),
        CONSTRAINT ck_ipv4_prefix CHECK (masklen(cidr) BETWEEN 16 AND 30),
        CONSTRAINT ck_ipv4_gateway_in CHECK (gateway << cidr),
        CONSTRAINT ck_ipv4_range_in CHECK (
          assignable_from << cidr AND assignable_to << cidr AND assignable_from <= assignable_to
        ),
        CONSTRAINT ck_ipv4_status CHECK (status IN ('ACTIVE', 'INACTIVE'))
      )
    `);
    await queryRunner.query(`
      DO $migration$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'ex_ipv4_networks_overlap'
            AND conrelid = 'ipv4_networks'::regclass
        ) THEN
          ALTER TABLE ipv4_networks
            ADD CONSTRAINT ex_ipv4_networks_overlap
            EXCLUDE USING gist (tenant_id WITH =, cidr inet_ops WITH &&);
        END IF;
      END
      $migration$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS network_plan_profiles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        plan_id uuid NOT NULL,
        pcq_address_list varchar(64) NOT NULL,
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_network_plan_profiles UNIQUE (tenant_id, plan_id)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS network_settings (
        tenant_id uuid PRIMARY KEY,
        enforce_provisioning_on_install_close boolean NOT NULL DEFAULT false,
        updated_by uuid NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.assertDestructiveDownAllowed(queryRunner);
    await queryRunner.query('DROP TABLE IF EXISTS network_settings');
    await queryRunner.query('DROP TABLE IF EXISTS network_plan_profiles');
    await queryRunner.query('DROP TABLE IF EXISTS ipv4_networks');
    await queryRunner.query('DROP INDEX IF EXISTS uq_network_routers_tenant_name');
    await queryRunner.query('DROP TABLE IF EXISTS network_routers');
  }

  private async assertDestructiveDownAllowed(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] === 'true') return;

    const populated: string[] = [];
    for (const table of CREATED_TABLES) {
      const relation = (await queryRunner.query('SELECT to_regclass($1) IS NOT NULL AS present', [
        table,
      ])) as Array<{ present: boolean }>;
      if (relation[0]?.present !== true) continue;

      const count = (await queryRunner.query(
        `SELECT COUNT(*)::int AS total FROM ${table}`,
      )) as Array<{
        total: number;
      }>;
      if ((count[0]?.total ?? 0) > 0) populated.push(`${table}=${count[0]?.total ?? 0}`);
    }

    if (populated.length > 0) {
      throw new Error(
        `Rollback de CreateNetworkCatalog bloqueado: hay datos (${populated.join(', ')}). ` +
          `Para continuar de forma destructiva, exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true de forma explícita.`,
      );
    }
  }
}
