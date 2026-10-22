import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';
const CREATED_TABLES = ['service_provisionings', 'ip_assignments', 'network_inbox_events'] as const;

/** Migración tenant 161: aprovisionamientos, asignaciones IPv4 e inbox idempotente de red. */
export class CreateNetworkProvisioning1610000000000 implements MigrationInterface {
  name = 'CreateNetworkProvisioning1610000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS service_provisionings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        subscriber_id uuid NOT NULL,
        expediente_id uuid NULL,
        contract_id uuid NULL,
        execution_order_id uuid NOT NULL,
        execution_order_number varchar(40) NOT NULL,
        router_id uuid NOT NULL REFERENCES network_routers(id),
        ipv4_network_id uuid NOT NULL REFERENCES ipv4_networks(id),
        ip_assignment_id uuid NULL,
        control_method varchar(40) NOT NULL,
        control_params jsonb NOT NULL,
        plan_id uuid NULL,
        download_mbps integer NULL,
        upload_mbps integer NULL,
        cpe_serial_number varchar(120) NULL,
        cpe_mac_address varchar(17) NULL,
        status varchar(16) NOT NULL,
        origin varchar(16) NOT NULL DEFAULT 'NORMAL',
        reserved_by uuid NULL,
        reserved_at timestamptz NULL,
        certified_by uuid NULL,
        certified_at timestamptz NULL,
        certification_evidence_id uuid NULL,
        activated_at timestamptz NULL,
        released_at timestamptz NULL,
        release_reason varchar(32) NULL,
        regularization_reason text NULL,
        regularized_by uuid NULL,
        regularized_at timestamptz NULL,
        released_by uuid NULL,
        failure_reason varchar(64) NULL,
        commercial_activation_status varchar(24) NOT NULL DEFAULT 'NOT_APPLICABLE',
        commercial_activation_detail varchar(64) NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        version integer NOT NULL DEFAULT 1,
        CONSTRAINT ck_sp_status CHECK (status IN ('RESERVED', 'CERTIFIED', 'ACTIVE', 'FAILED', 'RELEASED')),
        CONSTRAINT ck_sp_origin CHECK (origin IN ('NORMAL', 'REGULARIZED')),
        CONSTRAINT ck_sp_certified CHECK (
          status <> 'CERTIFIED' OR
          (certified_by IS NOT NULL AND certified_at IS NOT NULL AND certification_evidence_id IS NOT NULL)
        ),
        CONSTRAINT ck_sp_regularized CHECK (
          origin <> 'REGULARIZED' OR
          (regularization_reason IS NOT NULL AND regularized_by IS NOT NULL AND regularized_at IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sp_order_live
        ON service_provisionings (tenant_id, execution_order_id)
        WHERE status <> 'RELEASED'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sp_subscriber
        ON service_provisionings (tenant_id, subscriber_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sp_status
        ON service_provisionings (tenant_id, status)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ip_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        ipv4_network_id uuid NOT NULL REFERENCES ipv4_networks(id),
        ip inet NOT NULL,
        service_provisioning_id uuid NOT NULL REFERENCES service_provisionings(id),
        status varchar(16) NOT NULL,
        released_at timestamptz NULL,
        release_reason varchar(32) NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_ip_status CHECK (status IN ('RESERVED', 'ACTIVE', 'RELEASED')),
        CONSTRAINT ck_ip_host CHECK (masklen(ip) = 32)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_ip_assignments_live
        ON ip_assignments (tenant_id, ip)
        WHERE status IN ('RESERVED', 'ACTIVE')
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ip_assignments_network
        ON ip_assignments (tenant_id, ipv4_network_id, status)
    `);
    await queryRunner.query(`
      DO $migration$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
           WHERE conname = 'fk_sp_ip'
             AND conrelid = 'service_provisionings'::regclass
        ) THEN
          ALTER TABLE service_provisionings
            ADD CONSTRAINT fk_sp_ip FOREIGN KEY (ip_assignment_id) REFERENCES ip_assignments(id);
        END IF;
      END
      $migration$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS network_inbox_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        event_id uuid NOT NULL,
        event_type varchar(64) NOT NULL,
        execution_order_id uuid NOT NULL,
        processed_at timestamptz NULL,
        last_error_code varchar(64) NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_network_inbox UNIQUE (tenant_id, event_id)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.assertDestructiveDownAllowed(queryRunner);
    await queryRunner.query('DROP TABLE IF EXISTS network_inbox_events');
    await queryRunner.query(`
      ALTER TABLE IF EXISTS service_provisionings DROP CONSTRAINT IF EXISTS fk_sp_ip
    `);
    await queryRunner.query('DROP INDEX IF EXISTS idx_ip_assignments_network');
    await queryRunner.query('DROP INDEX IF EXISTS uq_ip_assignments_live');
    await queryRunner.query('DROP TABLE IF EXISTS ip_assignments');
    await queryRunner.query('DROP INDEX IF EXISTS idx_sp_status');
    await queryRunner.query('DROP INDEX IF EXISTS idx_sp_subscriber');
    await queryRunner.query('DROP INDEX IF EXISTS uq_sp_order_live');
    await queryRunner.query('DROP TABLE IF EXISTS service_provisionings');
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
        `Rollback de CreateNetworkProvisioning bloqueado: hay datos (${populated.join(', ')}). ` +
          `Para continuar de forma destructiva, exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true de forma explícita.`,
      );
    }
  }
}
