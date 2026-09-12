import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 129 — Lote de origen del activo serializado (MOD12 Inventario).
 *
 * Defecto que cierra: el saldo vive en `stock_balance` por la tupla
 * (ítem, lote, condición) y la recepción crea SIEMPRE un `stock_lots` para
 * todo ingreso, también para ítems SERIALIZED/FIXED_ASSET. La relación
 * serial↔lote existe de hecho (la recepción la conoce y la escribe en el
 * kardex) pero NO se persistía en `serialized_assets`: sin ella, nada puede
 * validar en la salida que los seriales elegidos pertenezcan al lote de la
 * línea.
 *
 * DDL aditivo y reversible (patrón 123):
 * - `lot_id UUID` nullable. Nullable a propósito: hay activos legítimos sin
 *   lote de origen (altas manuales, seriales previos al kardex) y la columna
 *   no puede inventarles uno.
 * - FK `fk_serialized_assets_lot` → `stock_lots (id)`, sin `ON DELETE`
 *   (mismo criterio que `fk_serialized_assets_item` y `fk_stock_lots_item` de
 *   la 047: un lote con activos no se borra en silencio).
 * - Índice PARCIAL `idx_serialized_assets_tenant_lot (tenant_id, lot_id)
 *   WHERE lot_id IS NOT NULL`: el patrón de consulta es «seriales de este
 *   lote» al validar una salida; los activos sin lote no participan de esa
 *   consulta y no deben engordar el índice.
 *
 * BACKFILL (idempotente, solo rellena `lot_id IS NULL`): la fuente fiable es
 * el kardex — `stock_movement_lines` lleva a la vez `serialized_asset_id` y
 * `lot_id`. Se toma el movimiento de RECEPCIÓN más antiguo de cada serial
 * (`PURCHASE_RECEIPT` o `COUNTER_PURCHASE`, excluyendo reversas), que es el
 * ingreso que creó el lote. Un serial sin movimiento de entrada con lote
 * queda en NULL: es el resultado correcto, no se inventa un valor.
 *
 * El `down` suelta índice, FK y columna. La pérdida del dato backfilleado es
 * inherente a soltar la columna y no es información perdida: el kardex sigue
 * siendo la fuente y un `up` posterior la vuelve a derivar igual.
 *
 * Todo el DDL usa `IF NOT EXISTS` (guarda por `pg_constraint` para la FK, que
 * no admite esa cláusula): `up` es re-ejecutable.
 *
 * Schema tenant (`search_path` del runner; sin prefijo explícito).
 */
export class AddSerializedAssetLot1290000000000 implements MigrationInterface {
  name = 'AddSerializedAssetLot1290000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE serialized_assets
        ADD COLUMN IF NOT EXISTS lot_id UUID
    `);

    await this.addLotForeignKey(queryRunner);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_serialized_assets_tenant_lot
        ON serialized_assets (tenant_id, lot_id)
        WHERE lot_id IS NOT NULL
    `);

    await this.backfillLotFromReceiptMovements(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_serialized_assets_tenant_lot`);

    await queryRunner.query(`
      ALTER TABLE serialized_assets
        DROP CONSTRAINT IF EXISTS fk_serialized_assets_lot
    `);

    await queryRunner.query(`
      ALTER TABLE serialized_assets
        DROP COLUMN IF EXISTS lot_id
    `);
  }

  /**
   * PostgreSQL no admite `ADD CONSTRAINT IF NOT EXISTS`: la existencia se
   * consulta en `pg_constraint` acotada a la tabla (resuelta vía `search_path`,
   * igual que el resto del DDL sin calificar de esta migración).
   */
  private async addLotForeignKey(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'fk_serialized_assets_lot'
            AND conrelid = 'serialized_assets'::regclass
        ) THEN
          ALTER TABLE serialized_assets
            ADD CONSTRAINT fk_serialized_assets_lot
            FOREIGN KEY (lot_id)
            REFERENCES stock_lots (id);
        END IF;
      END
      $$;
    `);
  }

  /**
   * Backfill desde el kardex: `DISTINCT ON (serialized_asset_id)` ordenado por
   * fecha del movimiento ascendente se queda con la RECEPCIÓN más antigua de
   * cada serial — la que creó el lote. Desempates por `created_at` de la línea
   * e `id` para que el resultado sea determinista.
   *
   * Acotado por `tenant_id` además del `id` del activo: dentro del schema el
   * tenant es uno solo, pero la condición deja el cruce explícito y evita que
   * un dato mal provisionado mezcle activos de otro tenant.
   *
   * Solo toca filas con `lot_id IS NULL`: re-ejecutarlo no pisa un lote ya
   * asignado por la recepción.
   */
  private async backfillLotFromReceiptMovements(queryRunner: QueryRunner): Promise<void> {
    const pendientes = await this.countRows(
      queryRunner,
      `
      SELECT COUNT(*) AS total
      FROM serialized_assets
      WHERE lot_id IS NULL
    `,
    );

    const recuperables = await this.countRows(
      queryRunner,
      `
      SELECT COUNT(DISTINCT sml.serialized_asset_id) AS total
      FROM stock_movement_lines sml
      JOIN stock_movements sm ON sm.id = sml.movement_id
      JOIN serialized_assets sa
        ON sa.id = sml.serialized_asset_id
       AND sa.tenant_id = sml.tenant_id
      WHERE sml.serialized_asset_id IS NOT NULL
        AND sml.lot_id IS NOT NULL
        AND sm.origin IN ('PURCHASE_RECEIPT', 'COUNTER_PURCHASE')
        AND sm.is_reversal = false
        AND sa.lot_id IS NULL
    `,
    );

    console.log(
      `[129] Backfill serial↔lote: ${pendientes} activo(s) sin lote; ` +
        `${recuperables} recuperable(s) desde el movimiento de recepción del kardex. ` +
        `El resto queda en NULL (sin movimiento de entrada con lote).`,
    );

    await queryRunner.query(`
      UPDATE serialized_assets sa
      SET lot_id = origen.lot_id,
          updated_at = NOW()
      FROM (
        SELECT DISTINCT ON (sml.serialized_asset_id)
               sml.serialized_asset_id AS serialized_asset_id,
               sml.tenant_id           AS tenant_id,
               sml.lot_id              AS lot_id
        FROM stock_movement_lines sml
        JOIN stock_movements sm ON sm.id = sml.movement_id
        WHERE sml.serialized_asset_id IS NOT NULL
          AND sml.lot_id IS NOT NULL
          AND sm.origin IN ('PURCHASE_RECEIPT', 'COUNTER_PURCHASE')
          AND sm.is_reversal = false
        ORDER BY sml.serialized_asset_id,
                 sm.created_at ASC,
                 sml.created_at ASC,
                 sml.id ASC
      ) AS origen
      WHERE sa.id = origen.serialized_asset_id
        AND sa.tenant_id = origen.tenant_id
        AND sa.lot_id IS NULL
    `);
  }

  private async countRows(queryRunner: QueryRunner, sql: string): Promise<number> {
    const rows = ((await queryRunner.query(sql)) as Array<{ total: string }> | undefined) ?? [];

    return Number(rows[0]?.total ?? 0);
  }
}
