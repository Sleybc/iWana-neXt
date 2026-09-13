import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 130 — Índices del listado de OT de ejecución (MOD11 F1).
 *
 * Spec: `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md`
 * §4.7.1 (Aprobada por el CTO). El orden por defecto de la bandeja es
 * `planned_window_start_at DESC, id DESC` (desempate obligatorio, ADR-065 §12)
 * y ningún índice vigente lo cubre (verificados en G3: 046 status/técnico/
 * schedule-event/site, 091 schedule unique, 094 template version, 098 scope).
 *
 * - `transactional = false` (ADR-066): `CREATE/DROP INDEX CONCURRENTLY`.
 * - Idempotente: `IF NOT EXISTS` / `IF EXISTS`.
 * - Sin DML (regla ADR-066 §4: DML y DDL no transaccional no se mezclan).
 * - Schema tenant (`search_path` del runner; sin prefijo explícito).
 *
 * ## Índices
 *
 * | Índice | Columnas | Consulta que cubre |
 * | --- | --- | --- |
 * | idx_execution_orders_tenant_window_start | (tenant_id, planned_window_start_at DESC, id DESC) | Orden por defecto del `GET /tasks/execution-orders` |
 * | idx_execution_orders_tenant_assigned_crew | (tenant_id, assigned_crew_id) | Filtro `assigneeId` por cuadrilla (spec §4.7.1); simétrico al de técnico de la 046 |
 *
 * El índice líder en `tenant_id` sigue la convención de la familia 046/091/098
 * de esta misma tabla: el `list()` filtra `tenant_id = :tenantId` explícito
 * además del `search_path`, así que la columna líder sí participa del plan.
 *
 * ## Índice de cuadrilla: justificación (directriz del despacho F1)
 *
 * Se INCLUYE. El filtro `assigneeId` acepta técnico **o** cuadrilla y sin este
 * índice la rama cuadrilla degrada a seq scan por tenant. Coste marginal dentro
 * de la misma pasada `CONCURRENTLY`; simétrico al índice de técnico que ya
 * existe (`idx_execution_orders_tenant_assigned_technician`, 046:100). Su uso
 * real por roles restringidos queda sujeto a que exista el port tipado de WFM
 * (deuda B-A1, refinamiento v2); los supervisores ya lo usan en v1.
 *
 * ## Mitigación de índice INVALID (patrón 089)
 *
 * `CREATE INDEX CONCURRENTLY` puede fallar y dejar el índice en estado INVALID
 * (`pg_index.indisvalid = false`); `IF NOT EXISTS` lo vería como existente y lo
 * omitiría en el reintento. Antes de cada `CREATE` se elimina el inválido con
 * el mismo nombre (consulta parametrizada + whitelist local, sin
 * dollar-quoting). Post-migración, `verifyExecutionOrdersListIndexes()` lista
 * inválidos o faltantes remanentes.
 */

/**
 * Nombres de los 2 índices que crea esta migración.
 * Útil para verificación post-migración y para el runner.
 */
export const EXECUTION_ORDERS_LIST_INDEX_NAMES = [
  'idx_execution_orders_tenant_window_start',
  'idx_execution_orders_tenant_assigned_crew',
] as const;

/**
 * Elimina un índice INVALID con el nombre dado, si existe.
 *
 * Misma técnica que `dropInvalidIndexIfExists` de la 089, con whitelist
 * propia: DDL no admite identificadores parametrizados, así que el nombre
 * interpolado se valida contra `EXECUTION_ORDERS_LIST_INDEX_NAMES`.
 */
export async function dropInvalidExecutionOrdersIndexIfExists(
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

  if ((rows as unknown[]).length > 0) {
    if (!(EXECUTION_ORDERS_LIST_INDEX_NAMES as readonly string[]).includes(indexName)) {
      throw new Error(`[130] index name not in whitelist: ${indexName}`);
    }
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "${indexName}"`);
    console.log(`[130] cleaned up invalid index: ${indexName}`);
  }
}

/**
 * Verifica que los índices del listado de OT del schema actual estén todos
 * válidos. Retorna los nombres de los que estén INVALID o falten
 * (vacío = todo OK). El caller es responsable del `search_path` correcto.
 */
export async function verifyExecutionOrdersListIndexes(
  queryRunner: QueryRunner,
): Promise<{ invalid: string[]; valid: string[]; missing: string[] }> {
  const rows = (await queryRunner.query(
    `
    SELECT
      c.relname AS index_name,
      i.indisvalid AS is_valid
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname LIKE 'idx_execution_orders_tenant\\_%'
      AND n.nspname = current_schema()
    ORDER BY c.relname
    `,
  )) as Array<{ index_name: string; is_valid: boolean }>;

  const found = new Set(rows.map((r) => r.index_name));
  const inScope = rows.filter((r) =>
    (EXECUTION_ORDERS_LIST_INDEX_NAMES as readonly string[]).includes(r.index_name),
  );
  const invalid = inScope.filter((r) => !r.is_valid).map((r) => r.index_name);
  const valid = inScope.filter((r) => r.is_valid).map((r) => r.index_name);
  const missing = EXECUTION_ORDERS_LIST_INDEX_NAMES.filter((n) => !found.has(n));

  return { invalid, valid, missing };
}

export class ExecutionOrdersListOrdering1300000000000 implements MigrationInterface {
  name = 'ExecutionOrdersListOrdering1300000000000';

  /**
   * ADR-066: DDL fuera de TX del runner (CREATE INDEX CONCURRENTLY).
   */
  transactional = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // —— Orden por defecto de la bandeja (spec §4.7.1) ——
    await dropInvalidExecutionOrdersIndexIfExists(
      queryRunner,
      'idx_execution_orders_tenant_window_start',
    );
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_execution_orders_tenant_window_start
        ON execution_orders (tenant_id, planned_window_start_at DESC, id DESC)
    `);

    // —— Filtro assigneeId por cuadrilla (simétrico al de técnico de la 046) ——
    await dropInvalidExecutionOrdersIndexIfExists(
      queryRunner,
      'idx_execution_orders_tenant_assigned_crew',
    );
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_execution_orders_tenant_assigned_crew
        ON execution_orders (tenant_id, assigned_crew_id)
    `);

    // —— Verificación post-migración: detecta índices INVALID o missing ——
    const verification = await verifyExecutionOrdersListIndexes(queryRunner);
    if (verification.invalid.length > 0) {
      console.warn(
        `[130] WARNING: ${verification.invalid.length} execution-orders index(es) INVALID:\n` +
          verification.invalid.map((n) => `  - ${n}`).join('\n') +
          `\nRebuild manually or re-run this migration.`,
      );
    }
    if (verification.missing.length > 0) {
      console.warn(
        `[130] WARNING: ${verification.missing.length} execution-orders index(es) MISSING:\n` +
          verification.missing.map((n) => `  - ${n}`).join('\n') +
          `\nThe CREATE step may have been skipped. Re-run this migration.`,
      );
    }
    if (verification.invalid.length === 0 && verification.missing.length === 0) {
      console.log(
        `[130] All ${verification.valid.length} execution-orders indexes verified valid.`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS idx_execution_orders_tenant_assigned_crew`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS idx_execution_orders_tenant_window_start`,
    );
  }
}
