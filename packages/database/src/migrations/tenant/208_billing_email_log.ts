import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 208 — registro de correos de Facturación (spec MOD05↔MOD14 2026-11-13 «Facturación en
 * la ficha estilo UISP» v1.1, bloque B: D5, D9, D10, R4, CA-4, CA-6).
 *
 * - `billing_email_log`: una fila por solicitud de envío de un documento de cobro (`FACTURA`), un
 *   recibo de pago (`RECIBO`) o el estado de cuenta (`ESTADO_CUENTA`). Guarda el destinatario
 *   enmascarado, el asunto generado por la plantilla, el estado y un motivo cerrado; nunca el
 *   mensaje de error del servidor de correo ni texto libre.
 * - Forma `kind` ↔ destino (CHECK): `FACTURA` lleva documento; `RECIBO`, pago; `ESTADO_CUENTA`,
 *   solo el periodo (opcional). Forma `status` ↔ `reason_code`: `RECHAZADO` con `SIN_CORREO` o
 *   `TITULAR_RESTRINGIDO`, `ERROR` con `FALLO_DE_ENVIO`, `EN_COLA` y `ENVIADO` sin motivo.
 * - Idempotencia (R4): índice único parcial por destino mientras la fila está `EN_COLA`.
 * - Borrar el documento o el pago (reversión de un lote importado) arrastra sus filas.
 * - `recipient_masked` lo vacía BillingTitularErasureParticipant al suprimir al titular.
 *
 * `down()` retira la tabla. Si hay filas lo bloquea salvo `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true`:
 * se perdería el registro auditado de los envíos al cliente.
 */
export class BillingEmailLog2080000000208 implements MigrationInterface {
  name = 'BillingEmailLog2080000000208';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE billing_email_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        subscriber_id uuid NOT NULL,
        kind varchar(20) NOT NULL
          CHECK (kind IN ('FACTURA','RECIBO','ESTADO_CUENTA')),
        document_id uuid NULL REFERENCES billing_documents(id) ON DELETE CASCADE,
        payment_id uuid NULL REFERENCES billing_payments(id) ON DELETE CASCADE,
        period_from date NULL,
        period_to date NULL,
        recipient_masked varchar(120) NULL,
        subject varchar(200) NOT NULL,
        status varchar(12) NOT NULL
          CHECK (status IN ('EN_COLA','ENVIADO','ERROR','RECHAZADO')),
        reason_code varchar(30) NULL
          CHECK (reason_code IS NULL OR reason_code IN
            ('SIN_CORREO','TITULAR_RESTRINGIDO','FALLO_DE_ENVIO')),
        resend boolean NOT NULL DEFAULT false,
        requested_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        processed_at timestamptz NULL,
        CONSTRAINT chk_billing_email_log_target_shape CHECK (
          (kind = 'FACTURA' AND document_id IS NOT NULL AND payment_id IS NULL
             AND period_from IS NULL AND period_to IS NULL)
          OR (kind = 'RECIBO' AND payment_id IS NOT NULL AND document_id IS NULL
             AND period_from IS NULL AND period_to IS NULL)
          OR (kind = 'ESTADO_CUENTA' AND document_id IS NULL AND payment_id IS NULL)
        ),
        CONSTRAINT chk_billing_email_log_period
          CHECK (period_from IS NULL OR period_to IS NULL OR period_from <= period_to),
        CONSTRAINT chk_billing_email_log_reason_shape CHECK (
          (status IN ('EN_COLA','ENVIADO') AND reason_code IS NULL)
          OR (status = 'RECHAZADO'
              AND COALESCE(reason_code IN ('SIN_CORREO','TITULAR_RESTRINGIDO'), false))
          OR (status = 'ERROR' AND COALESCE(reason_code = 'FALLO_DE_ENVIO', false))
        ),
        CONSTRAINT chk_billing_email_log_processed
          CHECK ((status = 'EN_COLA') = (processed_at IS NULL))
      )
    `);
    // R4: un solo envío en cola por destino (tipo + documento, pago o periodo del titular).
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_billing_email_log_queued_target
        ON billing_email_log (
          tenant_id, kind, COALESCE(document_id, payment_id, subscriber_id),
          COALESCE(period_from, DATE '0001-01-01'), COALESCE(period_to, DATE '0001-01-01')
        )
        WHERE status = 'EN_COLA'
    `);
    await queryRunner.query(`
      CREATE INDEX idx_billing_email_log_subscriber
        ON billing_email_log (tenant_id, subscriber_id, created_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Patrón de la 206: se consulta la existencia antes de contar (down repetido o up a medias).
    const [present] = (await queryRunner.query(
      `SELECT to_regclass('billing_email_log') IS NOT NULL AS present`,
    )) as Array<{ present: boolean }>;
    const rows = present?.present
      ? ((await queryRunner.query(
          `SELECT COUNT(*)::int AS total FROM billing_email_log`,
        )) as Array<{
          total: number;
        }>)
      : [];
    const total = rows[0]?.total ?? 0;
    if (total > 0 && process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      throw new Error(
        `Rollback de BillingEmailLog bloqueado: ${total} correo(s) registrados. ` +
          `Para continuar de forma destructiva, exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true.`,
      );
    }
    await queryRunner.query(`DROP TABLE IF EXISTS billing_email_log`);
  }
}
