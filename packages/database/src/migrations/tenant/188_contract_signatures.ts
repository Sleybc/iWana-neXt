import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 188 — firma del contrato y outbox de su activación (cierre de venta, bloque D;
 * ADR-109 D1/D2, CA-2, CA-4, CA-12).
 *
 * Schema tenant.
 * - `contract_signatures`: una firma por contrato (`uq_cs_contract`) y por clave de
 *   idempotencia (`uq_cs_idempotency`). Guarda la evidencia: fecha del servidor, técnico, OT,
 *   plantilla y versión, huellas del PDF sin firmar y firmado, objetos cifrados en medios
 *   (imagen de la firma y PDF firmado), ubicación con 3 decimales y dispositivo. Quien firma
 *   (nombre y documento) va cifrado con AES-256-GCM (`signer_encrypted`, clave PII).
 * - `contract_activation_events`: outbox de `crm.contract.activated`. Un evento por contrato
 *   (`uq_cae_contract`): repetir la activación no lo duplica. `id` es el eventId y el jobId.
 *
 * `down()` borra ambas tablas; con filas lo bloquea salvo
 * `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true` (la evidencia de firma no se reconstruye).
 */
export class ContractSignatures1880000000188 implements MigrationInterface {
  name = 'ContractSignatures1880000000188';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contract_signatures (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        contract_id uuid NOT NULL REFERENCES contracts (id),
        generation_id uuid NOT NULL REFERENCES contract_document_generations (id),
        idempotency_key uuid NOT NULL,
        execution_order_id uuid NOT NULL,
        technician_id uuid NOT NULL,
        signed_at timestamptz NOT NULL DEFAULT now(),
        signer_encrypted text NOT NULL,
        template_legal_text_id uuid NOT NULL,
        template_version varchar(32) NOT NULL,
        unsigned_document_sha256 char(64) NOT NULL,
        signed_document_sha256 char(64) NOT NULL,
        signature_asset_id uuid NOT NULL,
        signature_object_key varchar(500) NOT NULL,
        signed_document_asset_id uuid NOT NULL,
        signed_document_object_key varchar(500) NOT NULL,
        billing_start_date date NOT NULL,
        location_latitude numeric(6, 3) NULL,
        location_longitude numeric(7, 3) NULL,
        device_user_agent varchar(512) NOT NULL,
        device_platform varchar(64) NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_cs_contract UNIQUE (tenant_id, contract_id),
        CONSTRAINT uq_cs_idempotency UNIQUE (tenant_id, idempotency_key),
        CONSTRAINT chk_cs_sha256 CHECK (
          unsigned_document_sha256 ~ '^[0-9a-f]{64}$' AND signed_document_sha256 ~ '^[0-9a-f]{64}$'
        ),
        CONSTRAINT chk_cs_location CHECK (
          (location_latitude IS NULL) = (location_longitude IS NULL)
          AND (location_latitude IS NULL OR location_latitude BETWEEN -90 AND 90)
          AND (location_longitude IS NULL OR location_longitude BETWEEN -180 AND 180)
        )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_cs_generation ON contract_signatures (generation_id)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contract_activation_events (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        contract_id uuid NOT NULL REFERENCES contracts (id),
        source varchar(16) NOT NULL,
        envelope jsonb NOT NULL,
        occurred_at timestamptz NOT NULL DEFAULT now(),
        published_at timestamptz NULL,
        publish_attempts integer NOT NULL DEFAULT 0,
        last_error varchar(200) NULL,
        CONSTRAINT uq_cae_contract UNIQUE (tenant_id, contract_id),
        CONSTRAINT chk_cae_source CHECK (source IN ('SIGNATURE', 'MANUAL'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_cae_pending
        ON contract_activation_events (occurred_at) WHERE published_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      for (const table of ['contract_signatures', 'contract_activation_events']) {
        const exists = (await queryRunner.query(`SELECT to_regclass($1) IS NOT NULL AS present`, [
          table,
        ])) as Array<{ present: boolean }>;
        if (!exists[0]?.present) continue;
        const rows = (await queryRunner.query(
          `SELECT COUNT(*)::int AS total FROM ${table}`,
        )) as Array<{ total: number }>;
        const total = rows[0]?.total ?? 0;
        if (total > 0) {
          throw new Error(
            `Rollback de ContractSignatures bloqueado: ${table} contiene ${total} fila(s). ` +
              `Para continuar de forma destructiva, exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true.`,
          );
        }
      }
    }
    await queryRunner.query(`DROP INDEX IF EXISTS idx_cae_pending`);
    await queryRunner.query(`DROP TABLE IF EXISTS contract_activation_events`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_cs_generation`);
    await queryRunner.query(`DROP TABLE IF EXISTS contract_signatures`);
  }
}
