import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 073: red de defensa en BD para el invariante de reservas (MOD12 Fase 03B).
 *
 * Añade a stock_balances el CHECK `0 <= quantity_reserved <= quantity_on_hand`,
 * de modo que el invariante deje de vivir solo en TypeScript.
 *
 * Salvaguarda de datos: antes de crear el constraint acota cualquier fila que lo
 * violaría, con el mismo criterio LEAST(...) que usa la migración 072.
 * Idempotente: no falla si el constraint ya existe.
 * Reversible: down() elimina el constraint.
 */
export class AddStockBalanceReservationCheck0730000000000 implements MigrationInterface {
  name = 'AddStockBalanceReservationCheck0730000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        repaired_count integer;
      BEGIN
        WITH repaired AS (
          UPDATE stock_balances
          SET quantity_reserved = LEAST(
            GREATEST(COALESCE(quantity_reserved, 0), 0),
            GREATEST(COALESCE(quantity_on_hand, 0), 0)
          )
          WHERE quantity_reserved IS NULL
             OR quantity_reserved < 0
             OR quantity_reserved > quantity_on_hand
          RETURNING id
        )
        SELECT COUNT(*)::integer INTO repaired_count FROM repaired;

        IF repaired_count > 0 THEN
          RAISE NOTICE
            '073_add_stock_balance_reservation_check: % filas acotadas antes de crear el CHECK',
            repaired_count;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'chk_stock_balances_reserved_within_on_hand'
            AND conrelid = 'stock_balances'::regclass
        ) THEN
          ALTER TABLE stock_balances
            ADD CONSTRAINT chk_stock_balances_reserved_within_on_hand
            CHECK (quantity_reserved >= 0 AND quantity_reserved <= quantity_on_hand);
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE stock_balances
        DROP CONSTRAINT IF EXISTS chk_stock_balances_reserved_within_on_hand
    `);
  }
}
