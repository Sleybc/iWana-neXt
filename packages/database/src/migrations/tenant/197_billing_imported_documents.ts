import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 197 — documentos de cobro históricos `IMPORTADO` y pagos importados en MOD14
 * (ADR-110 D3 y D5; spec 2026-11-10 v1.1 CA-4).
 *
 * - `billing_documents` y `billing_payments` ganan `external_id` (`uisp:<entidad>:<id>`)
 *   e `import_batch_id`, con índice único parcial por tenant (promoción idempotente).
 * - `billing_documents.status` admite `IMPORTADO`. Un documento importado:
 *   no consume la numeración iWana (`number` NULL; el número de UISP va en
 *   `external_number`), exige `import_batch_id` y `external_id`, y puede no tener periodo
 *   de facturación (`period_id` deja de ser NOT NULL solo para él).
 * - Trigger `billing_documents_imported_status_guard`: ningún UPDATE convierte un
 *   documento en `IMPORTADO` ni lo saca de ese estado, así que no se emite ni se anula.
 *   El borrado (reversión por lote, D7) no se toca.
 *
 * `down()` restaura el CHECK de estado de la 173 y el NOT NULL de `period_id`. Si hay
 * documentos `IMPORTADO` o filas con datos de importación, lo bloquea salvo
 * `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true`, y entonces borra los documentos y pagos
 * importados con sus líneas y aplicaciones: no caben en el esquema de la 173 y, sin su
 * marca de lote, un pago importado pasaría por recaudo propio.
 */
export class BillingImportedDocuments1970000000197 implements MigrationInterface {
  name = 'BillingImportedDocuments1970000000197';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE billing_documents
        ADD COLUMN IF NOT EXISTS external_id varchar(160) NULL,
        ADD COLUMN IF NOT EXISTS external_number varchar(40) NULL,
        ADD COLUMN IF NOT EXISTS import_batch_id uuid NULL,
        ALTER COLUMN period_id DROP NOT NULL,
        DROP CONSTRAINT IF EXISTS billing_documents_status_check,
        ADD CONSTRAINT billing_documents_status_check
          CHECK (status IN ('BORRADOR','EMITIDO','ANULADO','IMPORTADO')),
        ADD CONSTRAINT chk_billing_documents_imported_shape
          CHECK (status <> 'IMPORTADO'
                 OR (number IS NULL AND import_batch_id IS NOT NULL AND external_id IS NOT NULL)),
        ADD CONSTRAINT chk_billing_documents_period_required
          CHECK (period_id IS NOT NULL OR status = 'IMPORTADO'),
        ADD CONSTRAINT chk_billing_documents_external_number_imported
          CHECK (external_number IS NULL OR status = 'IMPORTADO')
    `);
    await queryRunner.query(`
      ALTER TABLE billing_payments
        ADD COLUMN IF NOT EXISTS external_id varchar(160) NULL,
        ADD COLUMN IF NOT EXISTS import_batch_id uuid NULL
    `);
    for (const table of ['billing_documents', 'billing_payments']) {
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_${table}_external_id
          ON ${table} (tenant_id, external_id)
          WHERE external_id IS NOT NULL
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_${table}_import_batch
          ON ${table} (import_batch_id)
          WHERE import_batch_id IS NOT NULL
      `);
    }

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION billing_documents_imported_status_guard()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = pg_catalog, pg_temp
      AS $guard$
      BEGIN
        IF (OLD.status = 'IMPORTADO') IS DISTINCT FROM (NEW.status = 'IMPORTADO') THEN
          RAISE EXCEPTION 'billing_documents: un documento IMPORTADO no cambia de estado'
            USING ERRCODE = 'check_violation',
                  CONSTRAINT = 'billing_documents_imported_status_guard';
        END IF;
        RETURN NEW;
      END
      $guard$
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS billing_documents_imported_status_guard ON billing_documents
    `);
    await queryRunner.query(`
      CREATE TRIGGER billing_documents_imported_status_guard
        BEFORE UPDATE OF status ON billing_documents
        FOR EACH ROW EXECUTE FUNCTION billing_documents_imported_status_guard()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(`
      SELECT (SELECT COUNT(*) FROM billing_documents
               WHERE status = 'IMPORTADO' OR period_id IS NULL
                  OR import_batch_id IS NOT NULL OR external_id IS NOT NULL)::int
           + (SELECT COUNT(*) FROM billing_payments
               WHERE import_batch_id IS NOT NULL OR external_id IS NOT NULL)::int AS total
    `)) as Array<{ total: number }>;
    const total = rows[0]?.total ?? 0;
    if (total > 0) {
      if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
        throw new Error(
          `Migración 197: ${total} fila(s) de cobro traen datos de importación; ` +
            `define ${DESTRUCTIVE_DOWN_ENV_VAR}=true para revertir.`,
        );
      }
      await queryRunner.query(`
        DELETE FROM billing_payment_allocations
         WHERE document_id IN (SELECT id FROM billing_documents
                                WHERE status = 'IMPORTADO' OR period_id IS NULL)
            OR payment_id IN (SELECT id FROM billing_payments WHERE import_batch_id IS NOT NULL)
      `);
      await queryRunner.query(`
        DELETE FROM billing_documents WHERE status = 'IMPORTADO' OR period_id IS NULL
      `);
      await queryRunner.query(`DELETE FROM billing_payments WHERE import_batch_id IS NOT NULL`);
    }

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS billing_documents_imported_status_guard ON billing_documents
    `);
    await queryRunner.query(`DROP FUNCTION IF EXISTS billing_documents_imported_status_guard()`);
    for (const table of ['billing_documents', 'billing_payments']) {
      await queryRunner.query(`DROP INDEX IF EXISTS idx_${table}_import_batch`);
      await queryRunner.query(`DROP INDEX IF EXISTS uq_${table}_external_id`);
    }
    await queryRunner.query(`
      ALTER TABLE billing_payments
        DROP COLUMN IF EXISTS import_batch_id,
        DROP COLUMN IF EXISTS external_id
    `);
    await queryRunner.query(`
      ALTER TABLE billing_documents
        DROP CONSTRAINT IF EXISTS chk_billing_documents_external_number_imported,
        DROP CONSTRAINT IF EXISTS chk_billing_documents_period_required,
        DROP CONSTRAINT IF EXISTS chk_billing_documents_imported_shape,
        DROP CONSTRAINT IF EXISTS billing_documents_status_check,
        ADD CONSTRAINT billing_documents_status_check
          CHECK (status IN ('BORRADOR','EMITIDO','ANULADO')),
        ALTER COLUMN period_id SET NOT NULL,
        DROP COLUMN IF EXISTS import_batch_id,
        DROP COLUMN IF EXISTS external_number,
        DROP COLUMN IF EXISTS external_id
    `);
  }
}
