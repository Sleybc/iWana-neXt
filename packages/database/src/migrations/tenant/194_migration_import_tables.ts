import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 194 — lotes, intermedias y equivalencias de la importación desde UISP
 * (ADR-110 D1, D2, D4 y D10; spec 2026-11-10 v1.1 §3.3).
 *
 * - `migration_batches`: un lote por carga con estado `SIMULADO → CARGADO → PROMOVIDO →
 *   CONCILIADO` o `REVERTIDO`, fuente (`UISP_ZIP` en esta fase), conteos por entidad y
 *   rechazos por motivo (jsonb sin PII), actor y la fecha de purga a 30 días (D10).
 * - `migration_staging_records`: una fila por registro leído, con `external_id`
 *   `uisp:<entidad>:<id>` (D3) y la carga útil cifrada con la clave PII (AES-256-GCM,
 *   inventario K2). El motivo de rechazo es un código, nunca texto del titular.
 * - `migration_mappings`: equivalencias por tenant, sistema de origen y tipo (plan,
 *   método de pago, ciclo, etiqueta). Sin equivalencia no se inventa: se rechaza (D4).
 *
 * `down()` borra las tres tablas. Si hay lotes, lo bloquea salvo
 * `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true`: no hay backfill que los reconstruya.
 */
export class MigrationImportTables1940000000194 implements MigrationInterface {
  name = 'MigrationImportTables1940000000194';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS migration_batches (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        source varchar(16) NOT NULL,
        status varchar(12) NOT NULL DEFAULT 'SIMULADO',
        counts jsonb NOT NULL DEFAULT '{}'::jsonb,
        rejections jsonb NOT NULL DEFAULT '{}'::jsonb,
        source_object_key varchar(500) NULL,
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        promoted_at timestamptz NULL,
        reconciled_at timestamptz NULL,
        reverted_at timestamptz NULL,
        reverted_by uuid NULL,
        purge_after timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
        purged_at timestamptz NULL,
        CONSTRAINT chk_migration_batches_source CHECK (source IN ('UISP_ZIP')),
        CONSTRAINT chk_migration_batches_status
          CHECK (status IN ('SIMULADO','CARGADO','PROMOVIDO','CONCILIADO','REVERTIDO')),
        CONSTRAINT chk_migration_batches_counts_object CHECK (jsonb_typeof(counts) = 'object'),
        CONSTRAINT chk_migration_batches_rejections_object
          CHECK (jsonb_typeof(rejections) = 'object'),
        CONSTRAINT chk_migration_batches_reverted
          CHECK ((status = 'REVERTIDO') = (reverted_at IS NOT NULL)),
        CONSTRAINT chk_migration_batches_purge_window CHECK (purge_after > created_at)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_migration_batches_tenant_created
        ON migration_batches (tenant_id, created_at DESC, id DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_migration_batches_purge_pending
        ON migration_batches (purge_after)
        WHERE purged_at IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS migration_staging_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        batch_id uuid NOT NULL REFERENCES migration_batches (id) ON DELETE CASCADE,
        entity varchar(24) NOT NULL,
        external_id varchar(160) NOT NULL,
        payload_encrypted text NOT NULL,
        status varchar(12) NOT NULL DEFAULT 'VALIDO',
        rejection_reason varchar(60) NULL,
        promoted_entity_id uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_migration_staging_records_entity
          CHECK (entity IN ('SUSCRIPTOR','CONTRATO','DOCUMENTO_COBRO','PAGO','TICKET','SOPORTE_DOCUMENTAL')),
        CONSTRAINT chk_migration_staging_records_external_id
          CHECK (external_id ~ '^uisp:[a-z_]+:[A-Za-z0-9._-]{1,64}$'),
        CONSTRAINT chk_migration_staging_records_payload CHECK (length(payload_encrypted) > 0),
        CONSTRAINT chk_migration_staging_records_status
          CHECK (status IN ('VALIDO','RECHAZADO','PROMOVIDO','REVERTIDO')),
        CONSTRAINT chk_migration_staging_records_rejection
          CHECK ((status = 'RECHAZADO') = (rejection_reason IS NOT NULL)),
        CONSTRAINT chk_migration_staging_records_rejection_code
          CHECK (rejection_reason IS NULL OR rejection_reason ~ '^[A-Z][A-Z0-9_]{1,59}$'),
        CONSTRAINT uq_migration_staging_records_batch_entity_external
          UNIQUE (batch_id, entity, external_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_migration_staging_records_batch_status
        ON migration_staging_records (tenant_id, batch_id, status)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS migration_mappings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        source_system varchar(16) NOT NULL,
        kind varchar(20) NOT NULL,
        external_value varchar(120) NOT NULL,
        external_label varchar(120) NULL,
        action varchar(12) NOT NULL,
        target_ref varchar(80) NULL,
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_migration_mappings_source_system CHECK (source_system IN ('UISP')),
        CONSTRAINT chk_migration_mappings_kind
          CHECK (kind IN ('PLAN','METODO_PAGO','CICLO','ETIQUETA')),
        CONSTRAINT chk_migration_mappings_action
          CHECK (action IN ('EQUIVALE','DESCARTAR','NOTA')),
        CONSTRAINT chk_migration_mappings_action_kind
          CHECK (action = 'EQUIVALE' OR kind = 'ETIQUETA'),
        CONSTRAINT chk_migration_mappings_target
          CHECK ((action = 'EQUIVALE') = (target_ref IS NOT NULL)),
        CONSTRAINT chk_migration_mappings_external_value CHECK (length(btrim(external_value)) > 0),
        CONSTRAINT uq_migration_mappings_value
          UNIQUE (tenant_id, source_system, kind, external_value)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      const exists = (await queryRunner.query(
        `SELECT to_regclass('migration_batches') IS NOT NULL AS present`,
      )) as Array<{ present: boolean }>;
      if (exists[0]?.present) {
        const rows = (await queryRunner.query(
          `SELECT (SELECT COUNT(*) FROM migration_batches)::int
                + (SELECT COUNT(*) FROM migration_mappings)::int AS total`,
        )) as Array<{ total: number }>;
        const total = rows[0]?.total ?? 0;
        if (total > 0) {
          throw new Error(
            `Migración 194: hay ${total} lote(s) o equivalencia(s) de importación; ` +
              `define ${DESTRUCTIVE_DOWN_ENV_VAR}=true para revertir.`,
          );
        }
      }
    }
    await queryRunner.query(`DROP TABLE IF EXISTS migration_mappings`);
    await queryRunner.query(`DROP TABLE IF EXISTS migration_staging_records`);
    await queryRunner.query(`DROP TABLE IF EXISTS migration_batches`);
  }
}
