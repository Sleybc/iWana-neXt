import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración tenant 200 — deuda importada cobrable (ADR-110 D14).
 *
 * La 199 reservaba a la promoción toda aplicación a un documento `IMPORTADO`. Con D14 un pago
 * nuevo de iWana (sin `import_batch_id`) también puede aplicarse a esa deuda. La guarda sigue
 * para los pagos importados: solo la promoción (`iwana.import_promotion = 'on'`) los aplica a
 * un documento importado. Down restaura la regla de la 199 (no borra datos; las aplicaciones
 * ya hechas con pagos propios siguen, el trigger solo valida inserciones nuevas).
 */
function guardBody(allowOwnPayments: boolean): string {
  const condition = allowOwnPayments
    ? `COALESCE(v_payment_imported, false)
             AND current_setting('iwana.import_promotion', true) IS DISTINCT FROM 'on'`
    : `NOT COALESCE(v_payment_imported, false)
             OR current_setting('iwana.import_promotion', true) IS DISTINCT FROM 'on'`;
  const message = allowOwnPayments
    ? 'billing_payment_allocations: un pago importado solo se aplica a un documento IMPORTADO desde la promoción'
    : 'billing_payment_allocations: un documento IMPORTADO solo recibe aplicaciones de la promoción';
  return `
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
          IF ${condition} THEN
            RAISE EXCEPTION '${message}'
              USING ERRCODE = 'check_violation',
                    CONSTRAINT = 'billing_payment_allocations_import_guard';
          END IF;
        END IF;
        RETURN NEW;
      END
      $guard$
    `;
}

export class ImportedDebtCollectible2000000000200 implements MigrationInterface {
  name = 'ImportedDebtCollectible2000000000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(guardBody(true));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(guardBody(false));
  }
}
