import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 206 — retenciones en el pago (spec MOD14 2026-11-13 «Primer cobro completo», bloque C:
 * R6, R7, R8).
 *
 * - `billing_payment_withholdings`: una fila por retención practicada por el cliente al pagar
 *   (retefuente o reteICA, códigos de los presets de Tributación), con base, tarifa, valor y número
 *   de certificado. `billing_payments.amount` sigue siendo el valor recibido; la capacidad del pago
 *   para saldar es `amount + retenciones vigentes`.
 * - `document_id` atribuye la retención a un documento al que el mismo pago aplicó saldo.
 * - Anular el pago, o el documento al que se atribuye (H-3), llena `voided_at` y `voided_by` de
 *   sus retenciones; nunca se borran.
 * - Una sola retención vigente por (documento, tipo) — índice único parcial; el tope de base y de
 *   tarifa lo valida el servicio con el documento bloqueado (H-1).
 * - `certificate_number` es texto libre ligado al titular: lo vacía
 *   BillingTitularErasureParticipant (por eso admite NULL; el contrato lo exige al registrar).
 * - Borrar el pago (reversión de un lote importado) arrastra sus retenciones (ON DELETE CASCADE).
 *
 * `down()` retira la tabla. Si hay retenciones lo bloquea salvo
 * `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true`: sin la tabla, las aplicaciones que las usaron
 * superarían el valor recibido de su pago.
 */
export class BillingPaymentWithholdings2060000000206 implements MigrationInterface {
  name = 'BillingPaymentWithholdings2060000000206';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE billing_payment_withholdings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        payment_id uuid NOT NULL REFERENCES billing_payments(id) ON DELETE CASCADE,
        document_id uuid NOT NULL REFERENCES billing_documents(id),
        subscriber_id uuid NOT NULL,
        tax_code varchar(40) NOT NULL
          CHECK (tax_code IN ('RETE_FUENTE_SERVICIOS','RETE_ICA')),
        base numeric(14,2) NOT NULL CHECK (base > 0),
        rate numeric(7,4) NOT NULL CHECK (rate > 0 AND rate <= 100),
        amount numeric(14,2) NOT NULL CHECK (amount > 0),
        certificate_number varchar(60) NULL,
        voided_at timestamptz NULL,
        voided_by uuid NULL,
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_billing_payment_withholdings_amount_base CHECK (amount <= base),
        CONSTRAINT chk_billing_payment_withholdings_void_shape
          CHECK ((voided_at IS NULL) = (voided_by IS NULL))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_billing_payment_withholdings_payment
        ON billing_payment_withholdings (payment_id)
    `);
    // H-1 (a): una sola retención vigente por documento y tipo, entre todos los pagos.
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_billing_payment_withholdings_document_tax_active
        ON billing_payment_withholdings (tenant_id, document_id, tax_code) WHERE voided_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_billing_payment_withholdings_subscriber
        ON billing_payment_withholdings (tenant_id, subscriber_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // M6: PostgreSQL resuelve la tabla al planificar aunque la rama no se ejecute; se
    // consulta su existencia antes de contar (down repetido o up a medias).
    const [present] = (await queryRunner.query(
      `SELECT to_regclass('billing_payment_withholdings') IS NOT NULL AS present`,
    )) as Array<{ present: boolean }>;
    const rows = present?.present
      ? ((await queryRunner.query(
          `SELECT COUNT(*)::int AS total FROM billing_payment_withholdings`,
        )) as Array<{ total: number }>)
      : [];
    const total = rows[0]?.total ?? 0;
    if (total > 0 && process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      throw new Error(
        `Rollback de BillingPaymentWithholdings bloqueado: ${total} retención(es) registradas. ` +
          `Para continuar de forma destructiva, exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true.`,
      );
    }
    await queryRunner.query(`DROP TABLE IF EXISTS billing_payment_withholdings`);
  }
}
