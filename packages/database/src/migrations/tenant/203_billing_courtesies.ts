import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 203 — cortesías de MOD14 (spec 2026-11-12 «IVA por concepto y cortesías», bloque D:
 * D4, R4, R5, R6).
 *
 * - `billing_document_lines.kind` admite `CORTESIA`: la línea negativa de un borrador. Es la
 *   única línea con montos negativos y nunca positivos (CHECK
 *   `chk_billing_document_lines_courtesy_sign`).
 * - `idempotency_key` (otorgar) y `void_idempotency_key` (anular) guardan la cabecera
 *   Idempotency-Key, únicas por tenant: el reintento con el mismo comando devuelve la cortesía.
 * - `billing_courtesies`: una fila por cortesía. `LINEA_EN_BORRADOR` enlaza la línea negativa
 *   (`line_id`) y ya está dentro del total del documento; `AJUSTE_SOBRE_EMITIDO` es un abono no
 *   monetario que baja el saldo del documento sin tocar su base gravable (R6) y no es pago ni
 *   nota crédito. El saldo pendiente es total − aplicaciones vigentes − ajustes `ACTIVA`.
 *   `note` y `void_note` son texto libre: los cubre BillingTitularErasureParticipant.
 * - Borrar un borrador (descarte o supresión) arrastra su cortesía y su línea (ON DELETE CASCADE).
 *
 * `down()` retira la tabla y restaura el CHECK de la 193. Si hay cortesías o líneas `CORTESIA` lo
 * bloquea salvo `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true`, y entonces borra las líneas de los
 * borradores recalculando su total: sin la tabla el saldo de lo emitido volvería a subir. Una
 * línea `CORTESIA` de un documento ya emitido o anulado es fiscal y no se borra: con ella el
 * `down()` falla siempre.
 */
export class BillingCourtesies2030000000203 implements MigrationInterface {
  name = 'BillingCourtesies2030000000203';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE billing_document_lines
        DROP CONSTRAINT IF EXISTS billing_document_lines_kind_check,
        ADD CONSTRAINT billing_document_lines_kind_check
          CHECK (kind IN ('PLAN','ADICIONAL','PRORRATEO','INSTALACION','CORTESIA')),
        ADD CONSTRAINT chk_billing_document_lines_courtesy_sign
          CHECK (CASE WHEN kind = 'CORTESIA'
                      THEN unit_price <= 0 AND base_amount <= 0 AND tax_amount <= 0 AND total <= 0
                      ELSE unit_price >= 0 AND base_amount >= 0 AND tax_amount >= 0 AND total >= 0
                 END)
          NOT VALID
    `);
    await queryRunner.query(`
      CREATE TABLE billing_courtesies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        document_id uuid NOT NULL REFERENCES billing_documents(id) ON DELETE CASCADE,
        subscriber_id uuid NOT NULL,
        application varchar(24) NOT NULL
          CHECK (application IN ('LINEA_EN_BORRADOR','AJUSTE_SOBRE_EMITIDO')),
        target varchar(10) NOT NULL CHECK (target IN ('VALOR','LINEA')),
        source_line_id uuid NULL REFERENCES billing_document_lines(id) ON DELETE SET NULL,
        line_id uuid NULL REFERENCES billing_document_lines(id) ON DELETE SET NULL,
        amount numeric(14,2) NOT NULL CHECK (amount > 0),
        reason_code varchar(40) NOT NULL CHECK (reason_code IN (
          'PRORRATEO_INICIAL','FALLA_DEL_SERVICIO','RETENCION_DEL_CLIENTE',
          'PROMOCION_COMERCIAL','ERROR_OPERATIVO','OTRO')),
        note varchar(500) NULL,
        status varchar(10) NOT NULL DEFAULT 'ACTIVA' CHECK (status IN ('ACTIVA','ANULADA')),
        void_reason_code varchar(40) NULL CHECK (void_reason_code IS NULL OR void_reason_code IN (
          'ERROR_DE_REGISTRO','VALOR_INCORRECTO','DOCUMENTO_EQUIVOCADO','DECISION_REVERTIDA')),
        void_note varchar(500) NULL,
        voided_at timestamptz NULL,
        voided_by uuid NULL,
        idempotency_key varchar(80) NOT NULL,
        void_idempotency_key varchar(80) NULL,
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_billing_courtesies_void_shape
          CHECK ((status = 'ACTIVA' AND void_reason_code IS NULL AND voided_at IS NULL)
                 OR (status = 'ANULADA' AND void_reason_code IS NOT NULL AND voided_at IS NOT NULL)),
        CONSTRAINT chk_billing_courtesies_target_shape
          CHECK (target = 'VALOR' OR source_line_id IS NOT NULL OR status = 'ANULADA')
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_billing_courtesies_document_active
        ON billing_courtesies (document_id) WHERE status = 'ACTIVA'
    `);
    await queryRunner.query(`
      CREATE INDEX idx_billing_courtesies_subscriber
        ON billing_courtesies (tenant_id, subscriber_id, created_at DESC)
    `);
    // Idempotency-Key de otorgar y de anular: un reintento devuelve la misma cortesía.
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_billing_courtesies_idempotency
        ON billing_courtesies (tenant_id, idempotency_key)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_billing_courtesies_void_idempotency
        ON billing_courtesies (tenant_id, void_idempotency_key)
        WHERE void_idempotency_key IS NOT NULL
    `);
    // Una línea solo se regala una vez mientras la cortesía siga activa.
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_billing_courtesies_source_line_active
        ON billing_courtesies (source_line_id)
        WHERE status = 'ACTIVA' AND source_line_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(`
      SELECT (SELECT COUNT(*)::int FROM billing_courtesies) AS courtesies,
             (SELECT COUNT(*)::int FROM billing_document_lines WHERE kind = 'CORTESIA') AS lines,
             (SELECT COUNT(*)::int FROM billing_document_lines l
                JOIN billing_documents d ON d.id = l.document_id
               WHERE l.kind = 'CORTESIA' AND d.status <> 'BORRADOR') AS fiscal_lines
    `)) as Array<{ courtesies: number; lines: number; fiscal_lines: number }>;
    const courtesies = rows[0]?.courtesies ?? 0;
    const lines = rows[0]?.lines ?? 0;
    if ((rows[0]?.fiscal_lines ?? 0) > 0) {
      throw new Error(
        `Rollback de BillingCourtesies imposible: ${rows[0]?.fiscal_lines} línea(s) de cortesía ` +
          'en documentos emitidos o anulados no caben en el CHECK de la 193.',
      );
    }
    if (courtesies > 0 || lines > 0) {
      if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
        throw new Error(
          `Rollback de BillingCourtesies bloqueado: ${courtesies} cortesía(s) y ${lines} línea(s) ` +
            `de cortesía. Para continuar de forma destructiva, exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true.`,
        );
      }
      // Aquí todas las líneas son de borradores: se retiran y se recalcula su total.
      await queryRunner.query(`
        WITH removed AS (
          DELETE FROM billing_document_lines WHERE kind = 'CORTESIA'
          RETURNING document_id
        )
        UPDATE billing_documents d
           SET subtotal = t.subtotal, tax_total = t.tax_total, total = t.total, updated_at = now()
          FROM (
            SELECT l.document_id,
                   COALESCE(SUM(l.base_amount), 0) AS subtotal,
                   COALESCE(SUM(l.tax_amount), 0) AS tax_total,
                   COALESCE(SUM(l.total), 0) AS total
              FROM billing_document_lines l
             WHERE l.document_id IN (SELECT document_id FROM removed)
               AND l.kind <> 'CORTESIA'
             GROUP BY l.document_id
          ) t
         WHERE d.id = t.document_id AND d.status = 'BORRADOR'
      `);
    }
    await queryRunner.query(`DROP TABLE IF EXISTS billing_courtesies`);
    await queryRunner.query(`
      ALTER TABLE billing_document_lines
        DROP CONSTRAINT IF EXISTS chk_billing_document_lines_courtesy_sign,
        DROP CONSTRAINT IF EXISTS billing_document_lines_kind_check,
        ADD CONSTRAINT billing_document_lines_kind_check
          CHECK (kind IN ('PLAN','ADICIONAL','PRORRATEO','INSTALACION'))
    `);
  }
}
