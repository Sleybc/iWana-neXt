import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 089 — Ola 2 ADR-065: índices de soporte para ORDER BY de listados
 * offset (paginación numerada) y desempate por id / movement_number.
 *
 * - `transactional = false` (ADR-066): `CREATE/DROP INDEX CONCURRENTLY`.
 * - Idempotente: `IF NOT EXISTS` / `IF EXISTS`.
 * - Sin `tenant_id` como columna líder: en schema por tenant la cardinalidad de
 *   `tenant_id` es 1; las queries de listado no filtran por ella (aislamiento vía
 *   `search_path`). Un índice liderado por `tenant_id` no ayuda al planner.
 * - 087/088 (hash/backfill expediente) no se tocan.
 *
 * ## Mitigación de índice INVALID (ADR-066 §Consecuencias negativas, S-4 gate cierre)
 *
 * `CREATE INDEX CONCURRENTLY` puede fallar por deadlock, cancelación o presión
 * de I/O. PostgreSQL marca el índice como INVALID (`pg_index.indisvalid = false`)
 * y no lo elimina. En el reintento, `IF NOT EXISTS` ve el índice (inválido) como
 * existente y lo omite → el tenant queda sin el índice en silencio.
 *
 * **Corrección:** antes de cada `CREATE`, se elimina cualquier índice inválido
 * con el mismo nombre (consulta `pg_index.indisvalid = false`). Post-migración,
 * `verifyPaginationIndexes()` lista los `idx_pag_*` inválidos remanentes.
 *
 * ## Inventario índice → ORDER BY (Fase 1 / Ola 1)
 *
 * | Índice | Tabla | ORDER BY cubierto |
 * | --- | --- | --- |
 * | idx_pag_inventory_items_created_id | inventory_items | created_at DESC, id DESC |
 * | idx_pag_stock_balances_updated_id | stock_balances | updated_at DESC, id DESC |
 * | idx_pag_serialized_assets_updated_id | serialized_assets | updated_at DESC, id DESC |
 * | idx_pag_stock_locations_created_id | stock_locations | created_at DESC, id DESC |
 * | idx_pag_purchase_requests_created_id | purchase_requests | created_at DESC, id DESC |
 * | idx_pag_subscribers_created_id | subscribers | created_at DESC, id DESC |
 * | idx_pag_supplier_profiles_created_id | supplier_profiles | created_at DESC, id DESC |
 * | idx_pag_inventory_write_offs_created_id | inventory_write_offs | created_at DESC, id DESC |
 * | idx_pag_asset_loans_installed_id | asset_loan_assignments | installed_at DESC, id DESC |
 * | idx_pag_catalog_items_updated_id | catalog_items | updated_at DESC, id DESC (RECENTLY_UPDATED; soft-delete) |
 * | idx_pag_catalog_items_active_name_id | catalog_items | is_active DESC, name ASC, id ASC (ACTIVE_NAME; soft-delete) |
 * | idx_pag_audit_logs_created_id | audit_logs | created_at DESC, id DESC (completa idx_al_tenant_created) |
 * | idx_pag_stock_issues_created_id | stock_issues | created_at DESC, id DESC |
 * | idx_pag_stock_counts_created_id | stock_counts | created_at DESC, id DESC |
 * | idx_pag_visit_requests_created_id | visit_requests | created_at DESC, id ASC (listados por created_at; SLA CASE queda parcial) |
 * | idx_pag_support_tickets_created_id | support_tickets | created_at DESC, id DESC |
 * | idx_pag_stock_movements_created_num | stock_movements | created_at DESC, movement_number DESC |
 *
 * Nota ops (AI-PLAT-OPS): CONCURRENTLY evita bloqueo de escritura prolongado, pero
 * cada índice hace dos escaneos de tabla y puede generar I/O sostenido. Preferible
 * ventana de bajo tráfico al aplicar en tenants con volumen alto
 * (`stock_movements`, `audit_logs`). No exige ventana de mantenimiento exclusiva.
 */

/**
 * Nombres de los 17 índices que crea esta migración.
 * Útil para verificación post-migración y para el runner.
 */
export const PAGINATION_INDEX_NAMES = [
  'idx_pag_inventory_items_created_id',
  'idx_pag_stock_balances_updated_id',
  'idx_pag_serialized_assets_updated_id',
  'idx_pag_stock_locations_created_id',
  'idx_pag_purchase_requests_created_id',
  'idx_pag_subscribers_created_id',
  'idx_pag_supplier_profiles_created_id',
  'idx_pag_inventory_write_offs_created_id',
  'idx_pag_asset_loans_installed_id',
  'idx_pag_catalog_items_updated_id',
  'idx_pag_catalog_items_active_name_id',
  'idx_pag_audit_logs_created_id',
  'idx_pag_stock_issues_created_id',
  'idx_pag_stock_counts_created_id',
  'idx_pag_visit_requests_created_id',
  'idx_pag_support_tickets_created_id',
  'idx_pag_stock_movements_created_num',
] as const;

/**
 * Elimina un índice INVALID con el nombre dado, si existe.
 *
 * `CREATE INDEX CONCURRENTLY` puede fallar y dejar el índice en estado INVALID
 * (`pg_index.indisvalid = false`). `IF NOT EXISTS` ve ese índice como existente
 * y lo omite en el reintento. Esta función lo limpia antes del CREATE para que
 * el reintento pueda reconstruirlo desde cero.
 *
 * Implementación en dos pasos (sin dollar-quoting):
 * 1. SELECT parametrizado contra pg_index.indisvalid (fuera de DO $$, $1 sí es bind).
 * 2. DROP INDEX CONCURRENTLY como top-level con nombre validado contra whitelist.
 */
export async function dropInvalidIndexIfExists(
  queryRunner: QueryRunner,
  indexName: string,
): Promise<void> {
  const rows = await queryRunner.query(
    `SELECT 1 FROM pg_index i
     JOIN pg_class c ON c.oid = i.indexrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = $1 AND i.indisvalid = false AND n.nspname = current_schema()`,
    [indexName],
  );

  if ((rows as any[]).length > 0) {
    // Whitelist: solo nombres de la lista definida en esta misma migración.
    // DDL no admite identificadores parametrizados; la validación contra la
    // whitelist impide inyección de SQL en el nombre interpolado.
    if (!(PAGINATION_INDEX_NAMES as readonly string[]).includes(indexName)) {
      throw new Error(`[089] index name not in whitelist: ${indexName}`);
    }
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "${indexName}"`);
    console.log(`[089] cleaned up invalid index: ${indexName}`);
  }
}

/**
 * Verifica que los índices de paginación `idx_pag_*` del schema actual estén
 * todos válidos. Retorna los nombres de los que estén INVALID (vacío = todo OK).
 *
 * Pensada para ejecutarse post-migración (`up()`) o como verificación periódica.
 * El caller es responsable de estar en el search_path correcto.
 */
export async function verifyPaginationIndexes(
  queryRunner: QueryRunner,
): Promise<{ invalid: string[]; valid: string[]; missing: string[] }> {
  const rows = (await queryRunner.query(
    `
    SELECT
      c.relname AS index_name,
      i.indisvalid AS is_valid,
      pg_get_indexdef(i.indexrelid) AS index_def
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname LIKE 'idx_pag_%'
      AND n.nspname = current_schema()
    ORDER BY c.relname
    `,
  )) as Array<{ index_name: string; is_valid: boolean; index_def: string }>;

  const found = new Set(rows.map((r) => r.index_name));
  const invalid = rows.filter((r) => !r.is_valid).map((r) => r.index_name);
  const valid = rows.filter((r) => r.is_valid).map((r) => r.index_name);
  const missing = PAGINATION_INDEX_NAMES.filter((n) => !found.has(n));

  return { invalid, valid, missing };
}

export class PaginationOrderingIndexes0890000000000 implements MigrationInterface {
  name = 'PaginationOrderingIndexes0890000000000';

  /**
   * ADR-066: DDL fuera de TX del runner (CREATE INDEX CONCURRENTLY).
   */
  transactional = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // —— Sin cobertura previa (default ORDER BY Ola 1) ——
    await dropInvalidIndexIfExists(queryRunner, 'idx_pag_inventory_items_created_id');
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pag_inventory_items_created_id
        ON inventory_items (created_at DESC, id DESC)
    `);
    await dropInvalidIndexIfExists(queryRunner, 'idx_pag_stock_balances_updated_id');
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pag_stock_balances_updated_id
        ON stock_balances (updated_at DESC, id DESC)
    `);
    await dropInvalidIndexIfExists(queryRunner, 'idx_pag_serialized_assets_updated_id');
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pag_serialized_assets_updated_id
        ON serialized_assets (updated_at DESC, id DESC)
    `);
    await dropInvalidIndexIfExists(queryRunner, 'idx_pag_stock_locations_created_id');
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pag_stock_locations_created_id
        ON stock_locations (created_at DESC, id DESC)
    `);
    await dropInvalidIndexIfExists(queryRunner, 'idx_pag_purchase_requests_created_id');
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pag_purchase_requests_created_id
        ON purchase_requests (created_at DESC, id DESC)
    `);
    await dropInvalidIndexIfExists(queryRunner, 'idx_pag_subscribers_created_id');
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pag_subscribers_created_id
        ON subscribers (created_at DESC, id DESC)
    `);
    await dropInvalidIndexIfExists(queryRunner, 'idx_pag_supplier_profiles_created_id');
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pag_supplier_profiles_created_id
        ON supplier_profiles (created_at DESC, id DESC)
    `);
    await dropInvalidIndexIfExists(queryRunner, 'idx_pag_inventory_write_offs_created_id');
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pag_inventory_write_offs_created_id
        ON inventory_write_offs (created_at DESC, id DESC)
    `);
    await dropInvalidIndexIfExists(queryRunner, 'idx_pag_asset_loans_installed_id');
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pag_asset_loans_installed_id
        ON asset_loan_assignments (installed_at DESC, id DESC)
    `);
    await dropInvalidIndexIfExists(queryRunner, 'idx_pag_catalog_items_updated_id');
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pag_catalog_items_updated_id
        ON catalog_items (updated_at DESC, id DESC)
        WHERE deleted_at IS NULL
    `);
    await dropInvalidIndexIfExists(queryRunner, 'idx_pag_catalog_items_active_name_id');
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pag_catalog_items_active_name_id
        ON catalog_items (is_active DESC, name ASC, id ASC)
        WHERE deleted_at IS NULL
    `);

    // —— Cobertura parcial previa (falta desempate id / movement_number) ——
    await dropInvalidIndexIfExists(queryRunner, 'idx_pag_audit_logs_created_id');
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pag_audit_logs_created_id
        ON audit_logs (created_at DESC, id DESC)
    `);
    await dropInvalidIndexIfExists(queryRunner, 'idx_pag_stock_issues_created_id');
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pag_stock_issues_created_id
        ON stock_issues (created_at DESC, id DESC)
    `);
    await dropInvalidIndexIfExists(queryRunner, 'idx_pag_stock_counts_created_id');
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pag_stock_counts_created_id
        ON stock_counts (created_at DESC, id DESC)
    `);
    await dropInvalidIndexIfExists(queryRunner, 'idx_pag_visit_requests_created_id');
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pag_visit_requests_created_id
        ON visit_requests (created_at DESC, id ASC)
    `);
    await dropInvalidIndexIfExists(queryRunner, 'idx_pag_support_tickets_created_id');
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pag_support_tickets_created_id
        ON support_tickets (created_at DESC, id DESC)
    `);
    await dropInvalidIndexIfExists(queryRunner, 'idx_pag_stock_movements_created_num');
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pag_stock_movements_created_num
        ON stock_movements (created_at DESC, movement_number DESC)
    `);

    // —— Verificación post-migración: detecta índices INVALID o missing ——
    const verification = await verifyPaginationIndexes(queryRunner);
    if (verification.invalid.length > 0) {
      const warnLines = [
        `[089] WARNING: ${verification.invalid.length} pagination index(es) INVALID:`,
        ...verification.invalid.map((n) => `  - ${n}`),
        `Rebuild manually or re-run this migration.`,
      ];
      console.warn(warnLines.join('\n'));
    }
    if (verification.missing.length > 0) {
      const warnLines = [
        `[089] WARNING: ${verification.missing.length} pagination index(es) MISSING:`,
        ...verification.missing.map((n) => `  - ${n}`),
        `The CREATE step may have been skipped. Re-run this migration.`,
      ];
      console.warn(warnLines.join('\n'));
    }
    if (verification.invalid.length === 0 && verification.missing.length === 0) {
      console.log(`[089] All ${verification.valid.length} pagination indexes verified valid.`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS idx_pag_stock_movements_created_num`,
    );
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_pag_support_tickets_created_id`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_pag_visit_requests_created_id`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_pag_stock_counts_created_id`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_pag_stock_issues_created_id`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_pag_audit_logs_created_id`);
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS idx_pag_catalog_items_active_name_id`,
    );
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_pag_catalog_items_updated_id`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_pag_asset_loans_installed_id`);
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS idx_pag_inventory_write_offs_created_id`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS idx_pag_supplier_profiles_created_id`,
    );
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_pag_subscribers_created_id`);
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS idx_pag_purchase_requests_created_id`,
    );
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_pag_stock_locations_created_id`);
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS idx_pag_serialized_assets_updated_id`,
    );
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_pag_stock_balances_updated_id`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS idx_pag_inventory_items_created_id`);
  }
}
