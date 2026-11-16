import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración tenant 213: índices de la lectura
 * `GET /inventory/subscribers/:subscriberRefId/equipment` (MOD12, spec
 * 2026-11-16-mod05-mod12-equipos-del-suscriptor §2.1, R2).
 *
 * `EXPLAIN (ANALYZE)` con volumen sintético (40 040 comodatos, 90 000 líneas):
 *
 * | Índice | Consulta | Sin índice | Con índice |
 * | --- | --- | --- | --- |
 * | idx_asset_loan_assignments_tenant_subscriber | equipos e historial | Seq Scan, 2,5 ms, 747 buffers | Index Scan, 0,4 ms, 125 buffers |
 * | idx_stock_movement_lines_tenant_location | materiales | Seq Scan, 11,0 ms, 1 726 buffers | Index Scan, 0,8 ms, 179 buffers |
 *
 * Aditiva y reversible; `down()` solo elimina los índices. Se construyen
 * concurrentemente (ADR-066).
 */
export const ASSET_LOANS_SUBSCRIBER_INDEX_NAMES = [
  'idx_asset_loan_assignments_tenant_subscriber',
  'idx_stock_movement_lines_tenant_location',
] as const;

type IndexName = (typeof ASSET_LOANS_SUBSCRIBER_INDEX_NAMES)[number];

async function dropInvalidIndexIfExists(
  queryRunner: QueryRunner,
  indexName: IndexName,
): Promise<void> {
  const rows = (await queryRunner.query(
    `SELECT 1
       FROM pg_index i
       JOIN pg_class c ON c.oid = i.indexrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = $1
        AND n.nspname = current_schema()
        AND i.indisvalid = false`,
    [indexName],
  )) as unknown[];

  if (rows.length === 0) return;
  if (!(ASSET_LOANS_SUBSCRIBER_INDEX_NAMES as readonly string[]).includes(indexName)) {
    throw new Error(`Nombre de índice fuera de la lista permitida: ${indexName}`);
  }

  await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "${indexName}"`);
}

export class AssetLoansSubscriberIndex2130000000213 implements MigrationInterface {
  name = 'AssetLoansSubscriberIndex2130000000213';

  /** CREATE/DROP INDEX CONCURRENTLY no puede ejecutarse dentro de una transacción. */
  transactional = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await dropInvalidIndexIfExists(queryRunner, 'idx_asset_loan_assignments_tenant_subscriber');
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_asset_loan_assignments_tenant_subscriber
        ON asset_loan_assignments (tenant_id, subscriber_ref_id)
    `);

    await dropInvalidIndexIfExists(queryRunner, 'idx_stock_movement_lines_tenant_location');
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stock_movement_lines_tenant_location
        ON stock_movement_lines (tenant_id, location_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX CONCURRENTLY IF EXISTS idx_stock_movement_lines_tenant_location',
    );
    await queryRunner.query(
      'DROP INDEX CONCURRENTLY IF EXISTS idx_asset_loan_assignments_tenant_subscriber',
    );
  }
}
