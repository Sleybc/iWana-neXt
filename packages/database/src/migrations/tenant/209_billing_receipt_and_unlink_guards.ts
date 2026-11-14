import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 209 — invariantes en base del recibo numerado y del desasociar (informe de cierre
 * MOD05↔MOD14 «Facturación en la ficha estilo UISP» v1.0, SEC-05 / P-02).
 *
 * - Trigger `billing_payments_receipt_number_guard` (BEFORE UPDATE OF receipt_number): un
 *   `receipt_number` ya asignado no cambia ni vuelve a NULL. La numeración inicial (NULL → n)
 *   sigue permitida. Un pago anulado conserva su número.
 * - Trigger `billing_payments_void_guard` (BEFORE UPDATE OF status): un pago `ANULADO` no
 *   vuelve a otro estado (revisión sec-eng SEC-209-02).
 * - Trigger `billing_payment_allocations_reversal_guard` (BEFORE UPDATE OF reversed_at,
 *   reversed_by, reversal_reason_code):
 *   - una reversión ya escrita es inmutable: con `OLD.reversed_at` no nulo, cambiar
 *     `reversed_at`, `reversed_by` o `reversal_reason_code` se rechaza (SEC-209-01);
 *   sobre una aplicación vigente que queda revertida:
 *   - documento `IMPORTADO` o `ANULADO` y `reversal_reason_code` no nulo (desasociar manual):
 *     siempre rechazado;
 *   - documento `IMPORTADO` y motivo nulo: solo si el pago ya está `ANULADO` en esa misma
 *     transacción (anulación del pago, que fija el estado antes de revertir);
 *   - documento `ANULADO` y motivo nulo: permitido (la anulación del documento fija su estado
 *     antes de revertir sus aplicaciones).
 *   La excepción se apoya en el estado persistido del pago y del documento, no en texto libre ni
 *   en una marca de sesión. La reversión de un lote importado borra filas (DELETE) y no la toca.
 *
 * Los rechazos usan `ERRCODE check_violation` y el nombre del trigger como `CONSTRAINT`.
 * Funciones con `search_path` fijo y tablas calificadas con `TG_TABLE_SCHEMA`, como la 199.
 *
 * `down()` retira triggers y funciones; no toca datos (no requiere la guarda destructiva).
 */
export class BillingReceiptAndUnlinkGuards2090000000209 implements MigrationInterface {
  name = 'BillingReceiptAndUnlinkGuards2090000000209';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION billing_payments_receipt_number_guard()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = pg_catalog, pg_temp
      AS $guard$
      BEGIN
        IF OLD.receipt_number IS NOT NULL
           AND NEW.receipt_number IS DISTINCT FROM OLD.receipt_number THEN
          RAISE EXCEPTION 'billing_payments: el número de recibo asignado es inmutable'
            USING ERRCODE = 'check_violation',
                  CONSTRAINT = 'billing_payments_receipt_number_guard';
        END IF;
        RETURN NEW;
      END
      $guard$
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS billing_payments_receipt_number_guard ON billing_payments
    `);
    await queryRunner.query(`
      CREATE TRIGGER billing_payments_receipt_number_guard
        BEFORE UPDATE OF receipt_number ON billing_payments
        FOR EACH ROW EXECUTE FUNCTION billing_payments_receipt_number_guard()
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION billing_payments_void_guard()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = pg_catalog, pg_temp
      AS $guard$
      BEGIN
        IF OLD.status = 'ANULADO' AND NEW.status IS DISTINCT FROM 'ANULADO' THEN
          RAISE EXCEPTION 'billing_payments: un pago anulado no vuelve a otro estado'
            USING ERRCODE = 'check_violation',
                  CONSTRAINT = 'billing_payments_void_guard';
        END IF;
        RETURN NEW;
      END
      $guard$
    `);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS billing_payments_void_guard ON billing_payments`,
    );
    await queryRunner.query(`
      CREATE TRIGGER billing_payments_void_guard
        BEFORE UPDATE OF status ON billing_payments
        FOR EACH ROW EXECUTE FUNCTION billing_payments_void_guard()
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION billing_payment_allocations_reversal_guard()
      RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = pg_catalog, pg_temp
      AS $guard$
      DECLARE
        v_document_status text;
        v_payment_status text;
      BEGIN
        IF OLD.reversed_at IS NOT NULL THEN
          IF NEW.reversed_at IS DISTINCT FROM OLD.reversed_at
             OR NEW.reversed_by IS DISTINCT FROM OLD.reversed_by
             OR NEW.reversal_reason_code IS DISTINCT FROM OLD.reversal_reason_code THEN
            RAISE EXCEPTION 'billing_payment_allocations: una reversión registrada es inmutable'
              USING ERRCODE = 'check_violation',
                    CONSTRAINT = 'billing_payment_allocations_reversal_guard';
          END IF;
          RETURN NEW;
        END IF;
        IF NEW.reversed_at IS NULL THEN
          RETURN NEW;
        END IF;
        EXECUTE format(
          'SELECT status::text FROM %I.billing_documents WHERE id = $1',
          TG_TABLE_SCHEMA
        ) INTO v_document_status USING NEW.document_id;
        IF v_document_status IS NULL OR v_document_status NOT IN ('IMPORTADO', 'ANULADO') THEN
          RETURN NEW;
        END IF;
        IF NEW.reversal_reason_code IS NOT NULL THEN
          RAISE EXCEPTION 'billing_payment_allocations: no se desasocia un pago de un documento importado o anulado'
            USING ERRCODE = 'check_violation',
                  CONSTRAINT = 'billing_payment_allocations_reversal_guard';
        END IF;
        IF v_document_status = 'IMPORTADO' THEN
          EXECUTE format(
            'SELECT status::text FROM %I.billing_payments WHERE id = $1',
            TG_TABLE_SCHEMA
          ) INTO v_payment_status USING NEW.payment_id;
          IF v_payment_status IS DISTINCT FROM 'ANULADO' THEN
            RAISE EXCEPTION 'billing_payment_allocations: una aplicación a un documento importado solo se revierte al anular el pago'
              USING ERRCODE = 'check_violation',
                    CONSTRAINT = 'billing_payment_allocations_reversal_guard';
          END IF;
        END IF;
        RETURN NEW;
      END
      $guard$
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS billing_payment_allocations_reversal_guard ON billing_payment_allocations
    `);
    await queryRunner.query(`
      CREATE TRIGGER billing_payment_allocations_reversal_guard
        BEFORE UPDATE OF reversed_at, reversed_by, reversal_reason_code
        ON billing_payment_allocations
        FOR EACH ROW EXECUTE FUNCTION billing_payment_allocations_reversal_guard()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS billing_payment_allocations_reversal_guard ON billing_payment_allocations
    `);
    await queryRunner.query(`DROP FUNCTION IF EXISTS billing_payment_allocations_reversal_guard()`);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS billing_payments_void_guard ON billing_payments`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS billing_payments_void_guard()`);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS billing_payments_receipt_number_guard ON billing_payments
    `);
    await queryRunner.query(`DROP FUNCTION IF EXISTS billing_payments_receipt_number_guard()`);
  }
}
