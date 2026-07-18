import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 072: reconcilia quantity_reserved desde salidas abiertas (MOD12 Fase 03B).
 *
 * Idempotente: asigna el valor recalculado (nunca acumula).
 * Si el reservado calculado supera la existencia, acota al máximo disponible y deja traza.
 * Reversible: down() pone quantity_reserved = 0.
 */
export class ReconcileStockReservations0720000000000 implements MigrationInterface {
  name = 'ReconcileStockReservations0720000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        capped_count integer;
      BEGIN
        WITH calculated AS (
          SELECT
            sil.tenant_id,
            sil.item_id,
            si.source_location_id AS location_id,
            sil.lot_id,
            sil.condition,
            COALESCE(SUM(sil.requested_qty), 0)::numeric(12,2) AS reserved_qty
          FROM stock_issue_lines sil
          INNER JOIN stock_issues si
            ON si.id = sil.issue_id
           AND si.tenant_id = sil.tenant_id
          WHERE si.status NOT IN ('DISPATCHED', 'RECEIVED', 'CANCELLED')
          GROUP BY
            sil.tenant_id,
            sil.item_id,
            si.source_location_id,
            sil.lot_id,
            sil.condition
        ),
        updated AS (
          UPDATE stock_balances sb
          SET quantity_reserved = LEAST(
            sb.quantity_on_hand,
            COALESCE(c.reserved_qty, 0)
          )
          FROM calculated c
          WHERE sb.tenant_id = c.tenant_id
            AND sb.item_id = c.item_id
            AND sb.location_id = c.location_id
            AND sb.condition = c.condition
            AND sb.lot_id IS NOT DISTINCT FROM c.lot_id
          RETURNING
            sb.id,
            sb.quantity_on_hand,
            c.reserved_qty AS calculated_reserved,
            LEAST(sb.quantity_on_hand, COALESCE(c.reserved_qty, 0)) AS applied_reserved
        )
        SELECT COUNT(*)::integer
        INTO capped_count
        FROM updated
        WHERE calculated_reserved > quantity_on_hand;

        UPDATE stock_balances sb
        SET quantity_reserved = 0
        WHERE NOT EXISTS (
          SELECT 1
          FROM stock_issue_lines sil
          INNER JOIN stock_issues si
            ON si.id = sil.issue_id
           AND si.tenant_id = sil.tenant_id
          WHERE si.status NOT IN ('DISPATCHED', 'RECEIVED', 'CANCELLED')
            AND sil.tenant_id = sb.tenant_id
            AND sil.item_id = sb.item_id
            AND si.source_location_id = sb.location_id
            AND sil.condition = sb.condition
            AND sil.lot_id IS NOT DISTINCT FROM sb.lot_id
        );

        IF capped_count > 0 THEN
          RAISE NOTICE
            '072_reconcile_stock_reservations: % filas acotadas porque reserved calculado > on_hand',
            capped_count;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE stock_balances
      SET quantity_reserved = 0
    `);
  }
}
