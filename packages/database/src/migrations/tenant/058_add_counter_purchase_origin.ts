import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migracion 058: agrega origen COUNTER_PURCHASE al enum stock_movement_origin (MOD12 Fase 03).
 *
 * Estrategia de reversa (down):
 * PostgreSQL no permite DROP VALUE de un enum. Si existen movimientos con este origen,
 * down() es no-op documentado. Si no hay filas, recrea el tipo excluyendo COUNTER_PURCHASE.
 *
 * Ámbito de la guarda: `pg_enum`/`pg_type` abarcan toda la base. Sin filtrar por
 * `typnamespace` la guarda ve el enum de otro tenant ya migrado y se salta el
 * ADD VALUE en un schema donde falta — fallo silencioso que solo aparece en
 * runtime. Se filtra por `current_schema()`, el schema sobre el que actúa el
 * ALTER sin calificar.
 */
export class AddCounterPurchaseOrigin0580000000000 implements MigrationInterface {
  name = 'AddCounterPurchaseOrigin0580000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'stock_movement_origin'
            AND t.typnamespace = current_schema()::regnamespace
            AND e.enumlabel = 'COUNTER_PURCHASE'
        ) THEN
          ALTER TYPE stock_movement_origin ADD VALUE 'COUNTER_PURCHASE';
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const usage = (await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1
        FROM stock_movements
        WHERE origin = 'COUNTER_PURCHASE'
        LIMIT 1
      ) AS "inUse"
    `)) as Array<{ inUse: boolean }>;

    if (usage[0]?.inUse) {
      return;
    }

    await queryRunner.query(`
      ALTER TYPE stock_movement_origin
      RENAME TO stock_movement_origin_old
    `);

    await queryRunner.query(`
      CREATE TYPE stock_movement_origin AS ENUM (
        'PURCHASE_RECEIPT',
        'TRANSFER',
        'EXECUTION_ORDER',
        'SALE',
        'INTERNAL_CONSUMPTION',
        'RETURN',
        'REFURBISH',
        'ADJUSTMENT',
        'WRITE_OFF'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE stock_movements
      ALTER COLUMN origin TYPE stock_movement_origin
      USING origin::text::stock_movement_origin
    `);

    await queryRunner.query(`DROP TYPE IF EXISTS stock_movement_origin_old`);
  }
}
