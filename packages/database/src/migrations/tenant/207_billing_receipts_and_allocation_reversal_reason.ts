import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 207 — recibo numerado del pago y motivo de desasociación (spec MOD05↔MOD14 2026-11-13
 * «Facturación en la ficha estilo UISP» v1.1, bloque A: D3, D6, CA-3, CA-5).
 *
 * - `billing_payments.receipt_number`: consecutivo del recibo por tenant, solo en pagos nativos
 *   (`import_batch_id IS NULL`); un pago importado queda en NULL (CHECK). Es inmutable y un pago
 *   anulado conserva su número. El backfill numera los pagos nativos existentes, anulados
 *   incluidos, por tenant y en orden `(created_at, id)`. El servicio asigna los nuevos con
 *   `MAX + 1` bajo un advisory lock por tenant; el índice único parcial lo respalda.
 * - `billing_payment_allocations.reversal_reason_code`: motivo de dominio cerrado (CHECK) de una
 *   desasociación manual. Nulo en las reversiones que produce anular el pago. Solo existe en una
 *   aplicación revertida.
 *
 * `down()` retira columnas, restricciones e índice. Si hay recibos numerados o motivos
 * registrados lo bloquea salvo `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true`: se perdería la
 * numeración emitida a los clientes.
 */
export class BillingReceiptsAndAllocationReversalReason2070000000207 implements MigrationInterface {
  name = 'BillingReceiptsAndAllocationReversalReason2070000000207';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE billing_payments
        ADD COLUMN IF NOT EXISTS receipt_number bigint NULL
    `);
    await queryRunner.query(`
      WITH numbered AS (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at, id) AS n
          FROM billing_payments
         WHERE import_batch_id IS NULL
      )
      UPDATE billing_payments p
         SET receipt_number = numbered.n
        FROM numbered
       WHERE p.id = numbered.id AND p.receipt_number IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE billing_payments
        DROP CONSTRAINT IF EXISTS chk_billing_payments_receipt_native,
        ADD CONSTRAINT chk_billing_payments_receipt_native
          CHECK (receipt_number IS NULL OR import_batch_id IS NULL),
        DROP CONSTRAINT IF EXISTS chk_billing_payments_receipt_positive,
        ADD CONSTRAINT chk_billing_payments_receipt_positive
          CHECK (receipt_number IS NULL OR receipt_number > 0)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_payments_receipt_number
        ON billing_payments (tenant_id, receipt_number) WHERE receipt_number IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE billing_payment_allocations
        ADD COLUMN IF NOT EXISTS reversal_reason_code varchar(40) NULL,
        DROP CONSTRAINT IF EXISTS chk_billing_allocations_reversal_reason_code,
        ADD CONSTRAINT chk_billing_allocations_reversal_reason_code
          CHECK (reversal_reason_code IS NULL OR reversal_reason_code IN
            ('APLICADO_A_DOCUMENTO_EQUIVOCADO', 'VALOR_EQUIVOCADO', 'REASIGNACION')),
        DROP CONSTRAINT IF EXISTS chk_billing_allocations_reversal_reason_shape,
        ADD CONSTRAINT chk_billing_allocations_reversal_reason_shape
          CHECK (reversal_reason_code IS NULL OR reversed_at IS NOT NULL)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Patrón de la 206: se consulta la existencia de cada columna antes de contar (down repetido
    // o up a medias); PostgreSQL resuelve la columna al planificar aunque la rama no corra.
    const present = (await queryRunner.query(
      `SELECT table_name::text AS table_name
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND ((table_name = 'billing_payments' AND column_name = 'receipt_number')
            OR (table_name = 'billing_payment_allocations' AND column_name = 'reversal_reason_code'))`,
    )) as Array<{ table_name: string }>;
    const has = (table: string) => present.some((row) => row.table_name === table);
    let total = 0;
    if (has('billing_payments')) {
      const [row] = (await queryRunner.query(
        `SELECT COUNT(*)::int AS total FROM billing_payments WHERE receipt_number IS NOT NULL`,
      )) as Array<{ total: number }>;
      total += row?.total ?? 0;
    }
    if (has('billing_payment_allocations')) {
      const [row] = (await queryRunner.query(
        `SELECT COUNT(*)::int AS total FROM billing_payment_allocations
          WHERE reversal_reason_code IS NOT NULL`,
      )) as Array<{ total: number }>;
      total += row?.total ?? 0;
    }
    if (total > 0 && process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      throw new Error(
        `Rollback de BillingReceiptsAndAllocationReversalReason bloqueado: ${total} recibo(s) ` +
          `numerado(s) o motivo(s) de desasociación. Para continuar de forma destructiva, ` +
          `exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true.`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE billing_payment_allocations
        DROP CONSTRAINT IF EXISTS chk_billing_allocations_reversal_reason_shape,
        DROP CONSTRAINT IF EXISTS chk_billing_allocations_reversal_reason_code,
        DROP COLUMN IF EXISTS reversal_reason_code
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_billing_payments_receipt_number`);
    await queryRunner.query(`
      ALTER TABLE billing_payments
        DROP CONSTRAINT IF EXISTS chk_billing_payments_receipt_positive,
        DROP CONSTRAINT IF EXISTS chk_billing_payments_receipt_native,
        DROP COLUMN IF EXISTS receipt_number
    `);
  }
}
