import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

const LIFECYCLE_REASONS_BEFORE_199 = [
  'MORA',
  'SOLICITUD_TITULAR',
  'USO_INDEBIDO',
  'ORDEN_AUTORIDAD',
  'FALLA_TECNICA_PROLONGADA',
  'PAGO_REGISTRADO',
  'FIN_SUSPENSION_SOLICITADA',
  'CORRECCION_OPERATIVA',
  'LEVANTAMIENTO_ORDEN',
  'MORA_PROLONGADA',
  'TRASLADO_SIN_COBERTURA',
  'DUPLICADO',
  'DESCARTE_EXPEDIENTE',
];

function inList(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(', ');
}

/**
 * Migración 199 — promoción, conciliación y reversión de la importación desde UISP y
 * soportes documentales del suscriptor (ADR-110 D3, D5–D7, D13).
 *
 * - `subscriber_documents` (D13): soporte documental del suscriptor con el archivo en storage
 *   privado (solo URL firmada), tipo, tamaño, SHA-256, origen `IMPORTADO`, visibilidad interna
 *   y `external_id` `uisp:document:<código>` con índice único parcial (D3). No guarda el
 *   nombre original del archivo (no confiable, con posible PII) ni texto libre: no entra al
 *   manifiesto de supresión de texto; la supresión del titular retira el archivo.
 * - `crm_lifecycle_changes` admite `source = 'IMPORTADO'` y el motivo `HISTORICO_IMPORTADO`:
 *   los periodos de suspensión de UISP entran al historial con `batch_id` = lote de importación.
 * - `billing_documents.external_pdf_key`: clave del PDF histórico en storage (solo
 *   `IMPORTADO`).
 * - Trigger `billing_payment_allocations_import_guard`: una aplicación a un documento
 *   `IMPORTADO` solo la crea la promoción (`SET LOCAL iwana.import_promotion = 'on'`) y solo
 *   desde un pago importado. La operación normal de MOD14 no puede tocarlos.
 * - `migration_batches` gana `promotion`, `reconciliation` (jsonb sin PII) y `promoted_by`;
 *   `migration_staging_records.promotion_meta` guarda identificadores de lo creado (sin PII).
 *
 * `down()` bloquea si hay soportes, historial importado o PDFs importados salvo
 * `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true`.
 */
export class ImportPromotionAndSubscriberDocuments1990000000199 implements MigrationInterface {
  name = 'ImportPromotionAndSubscriberDocuments1990000000199';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS subscriber_documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        subscriber_id uuid NOT NULL REFERENCES subscribers (id) ON DELETE RESTRICT,
        kind varchar(12) NOT NULL,
        content_type varchar(100) NOT NULL,
        size_bytes integer NOT NULL,
        sha256 char(64) NOT NULL,
        storage_key varchar(300) NOT NULL,
        origin varchar(12) NOT NULL,
        visibility varchar(12) NOT NULL DEFAULT 'INTERNA',
        document_date date NULL,
        external_id varchar(160) NULL,
        import_batch_id uuid NULL,
        created_by uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        CONSTRAINT chk_subscriber_documents_kind CHECK (kind IN ('PDF','IMAGEN','OTRO')),
        CONSTRAINT chk_subscriber_documents_origin CHECK (origin IN ('IMPORTADO')),
        CONSTRAINT chk_subscriber_documents_visibility CHECK (visibility IN ('INTERNA')),
        CONSTRAINT chk_subscriber_documents_size CHECK (size_bytes >= 0),
        CONSTRAINT chk_subscriber_documents_sha256 CHECK (sha256 ~ '^[0-9a-f]{64}$'),
        CONSTRAINT chk_subscriber_documents_imported
          CHECK (origin <> 'IMPORTADO' OR (external_id IS NOT NULL AND import_batch_id IS NOT NULL))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriber_documents_external_id
        ON subscriber_documents (tenant_id, external_id)
        WHERE external_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_subscriber_documents_subscriber
        ON subscriber_documents (tenant_id, subscriber_id, created_at DESC)
        WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_subscriber_documents_import_batch
        ON subscriber_documents (import_batch_id)
        WHERE import_batch_id IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE crm_lifecycle_changes
        DROP CONSTRAINT IF EXISTS ck_crm_lifecycle_changes_source,
        ADD CONSTRAINT ck_crm_lifecycle_changes_source
          CHECK (source IN ('MANUAL','SYSTEM','BILLING','IMPORTADO')),
        DROP CONSTRAINT IF EXISTS ck_crm_lifecycle_changes_reason_code,
        ADD CONSTRAINT ck_crm_lifecycle_changes_reason_code
          CHECK (reason_code IN (${inList([...LIFECYCLE_REASONS_BEFORE_199, 'HISTORICO_IMPORTADO'])})),
        DROP CONSTRAINT IF EXISTS ck_crm_lifecycle_changes_imported_reason,
        ADD CONSTRAINT ck_crm_lifecycle_changes_imported_reason
          CHECK ((source = 'IMPORTADO') = (reason_code = 'HISTORICO_IMPORTADO'))
    `);

    await queryRunner.query(`
      ALTER TABLE billing_documents
        ADD COLUMN IF NOT EXISTS external_pdf_key varchar(300) NULL,
        DROP CONSTRAINT IF EXISTS chk_billing_documents_external_pdf_imported,
        ADD CONSTRAINT chk_billing_documents_external_pdf_imported
          CHECK (external_pdf_key IS NULL OR status = 'IMPORTADO')
    `);

    await queryRunner.query(`
      ALTER TABLE migration_batches
        ADD COLUMN IF NOT EXISTS promotion jsonb NULL,
        ADD COLUMN IF NOT EXISTS reconciliation jsonb NULL,
        ADD COLUMN IF NOT EXISTS promoted_by uuid NULL
    `);
    await queryRunner.query(`
      ALTER TABLE migration_staging_records
        ADD COLUMN IF NOT EXISTS promotion_meta jsonb NULL
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION billing_payment_allocations_import_guard()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = pg_catalog, pg_temp
      AS $guard$
      DECLARE
        v_document_imported boolean;
        v_payment_imported boolean;
      BEGIN
        EXECUTE format(
          'SELECT status = ''IMPORTADO'' FROM %I.billing_documents WHERE id = $1',
          TG_TABLE_SCHEMA
        ) INTO v_document_imported USING NEW.document_id;
        IF COALESCE(v_document_imported, false) THEN
          EXECUTE format(
            'SELECT import_batch_id IS NOT NULL FROM %I.billing_payments WHERE id = $1',
            TG_TABLE_SCHEMA
          ) INTO v_payment_imported USING NEW.payment_id;
          IF NOT COALESCE(v_payment_imported, false)
             OR current_setting('iwana.import_promotion', true) IS DISTINCT FROM 'on' THEN
            RAISE EXCEPTION 'billing_payment_allocations: un documento IMPORTADO solo recibe aplicaciones de la promoción'
              USING ERRCODE = 'check_violation',
                    CONSTRAINT = 'billing_payment_allocations_import_guard';
          END IF;
        END IF;
        RETURN NEW;
      END
      $guard$
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS billing_payment_allocations_import_guard ON billing_payment_allocations
    `);
    await queryRunner.query(`
      CREATE TRIGGER billing_payment_allocations_import_guard
        BEFORE INSERT OR UPDATE OF document_id, payment_id ON billing_payment_allocations
        FOR EACH ROW EXECUTE FUNCTION billing_payment_allocations_import_guard()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(`
      SELECT (SELECT COUNT(*) FROM subscriber_documents)::int
           + (SELECT COUNT(*) FROM crm_lifecycle_changes WHERE source = 'IMPORTADO')::int
           + (SELECT COUNT(*) FROM billing_documents WHERE external_pdf_key IS NOT NULL)::int
           AS total
    `)) as Array<{ total: number }>;
    const total = rows[0]?.total ?? 0;
    if (total > 0) {
      if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
        throw new Error(
          `Migración 199: ${total} fila(s) de soportes o historial importado; ` +
            `define ${DESTRUCTIVE_DOWN_ENV_VAR}=true para revertir.`,
        );
      }
      await queryRunner.query(`DELETE FROM crm_lifecycle_changes WHERE source = 'IMPORTADO'`);
    }

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS billing_payment_allocations_import_guard ON billing_payment_allocations
    `);
    await queryRunner.query(`DROP FUNCTION IF EXISTS billing_payment_allocations_import_guard()`);
    await queryRunner.query(`
      ALTER TABLE migration_staging_records DROP COLUMN IF EXISTS promotion_meta
    `);
    await queryRunner.query(`
      ALTER TABLE migration_batches
        DROP COLUMN IF EXISTS promoted_by,
        DROP COLUMN IF EXISTS reconciliation,
        DROP COLUMN IF EXISTS promotion
    `);
    await queryRunner.query(`
      ALTER TABLE billing_documents
        DROP CONSTRAINT IF EXISTS chk_billing_documents_external_pdf_imported,
        DROP COLUMN IF EXISTS external_pdf_key
    `);
    await queryRunner.query(`
      ALTER TABLE crm_lifecycle_changes
        DROP CONSTRAINT IF EXISTS ck_crm_lifecycle_changes_imported_reason,
        DROP CONSTRAINT IF EXISTS ck_crm_lifecycle_changes_reason_code,
        ADD CONSTRAINT ck_crm_lifecycle_changes_reason_code
          CHECK (reason_code IN (${inList(LIFECYCLE_REASONS_BEFORE_199)})),
        DROP CONSTRAINT IF EXISTS ck_crm_lifecycle_changes_source,
        ADD CONSTRAINT ck_crm_lifecycle_changes_source
          CHECK (source IN ('MANUAL','SYSTEM','BILLING'))
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS subscriber_documents`);
  }
}
