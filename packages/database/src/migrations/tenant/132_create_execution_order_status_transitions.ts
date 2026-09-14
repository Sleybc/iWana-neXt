import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 132 — Tabla de asientos de transición de la OT (MOD11, ADR-089 §D1).
 *
 * Spec: `docs/specs/2026-09-14-mod11-linea-tiempo-ot-design.md` §4.1 (Aprobada
 * por el CTO). Cada cambio de estado de una `ExecutionOrder` deja un asiento
 * con origen, destino, instante, actor y motivo cuando lo haya; réplica del
 * modelo `StatusChange` del expediente sin relación TypeORM (las hijas de
 * MOD11 no declaran FK) y sin duraciones calculadas (ADR-089 §D2/R5).
 *
 * - `transactional = false` (ADR-066): `CREATE/DROP INDEX CONCURRENTLY`.
 * - Idempotente: `IF NOT EXISTS` / `IF EXISTS` + `DO ... EXCEPTION WHEN
 *   duplicate_object` para el enum heredado.
 * - Sin DML (regla ADR-066 §4). Sin reconstrucción retroactiva (spec §4.5):
 *   las OT anteriores conservan `startedAt` sin línea de tiempo.
 * - Schema tenant (`search_path` del runner; sin prefijo explícito).
 * - Reutiliza el tipo `execution_order_status` de la 046 (no crea enum nuevo).
 *
 * ## Índice
 *
 * | Índice | Columnas | Consulta que cubre |
 * | --- | --- | --- |
 * | idx_execution_order_transitions_order_changed_at | (tenant_id, execution_order_id, changed_at) | Historial de una OT ordenado por instante (única lectura de T1; T3 agregará sobre él) |
 *
 * El índice líder en `tenant_id` sigue la convención de la familia 046/091/098:
 * el servicio filtra `tenant_id = :tenantId` explícito además del
 * `search_path`, así que la columna líder sí participa del plan.
 *
 * ## Mitigación de índice INVALID (patrón 089/130)
 *
 * `CREATE INDEX CONCURRENTLY` puede fallar y dejar el índice en estado INVALID
 * (`pg_index.indisvalid = false`); `IF NOT EXISTS` lo vería como existente y lo
 * omitiría en el reintento. Antes del `CREATE` se elimina el inválido con el
 * mismo nombre (consulta parametrizada + whitelist local, sin
 * dollar-quoting). Post-migración, `verifyExecutionOrderTransitionIndexes()`
 * lista inválidos o faltantes remanentes.
 */

/** Nombres de los índices que crea esta migración. */
export const EXECUTION_ORDER_TRANSITION_INDEX_NAMES = [
  'idx_execution_order_transitions_order_changed_at',
] as const;

/**
 * Elimina un índice INVALID con el nombre dado, si existe.
 *
 * DDL no admite identificadores parametrizados, así que el nombre interpolado
 * se valida contra `EXECUTION_ORDER_TRANSITION_INDEX_NAMES`.
 */
export async function dropInvalidExecutionOrderTransitionIndexIfExists(
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
    if (!(EXECUTION_ORDER_TRANSITION_INDEX_NAMES as readonly string[]).includes(indexName)) {
      throw new Error(`[132] index name not in whitelist: ${indexName}`);
    }
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "${indexName}"`);
    console.log(`[132] cleaned up invalid index: ${indexName}`);
  }
}

/**
 * Verifica que los índices de la línea de tiempo del schema actual estén
 * válidos. Retorna los nombres INVALID o faltantes (vacío = todo OK).
 * El caller es responsable del `search_path` correcto.
 */
export async function verifyExecutionOrderTransitionIndexes(
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
    WHERE c.relname LIKE 'idx_execution_order_transitions\\_%'
      AND n.nspname = current_schema()
    ORDER BY c.relname
    `,
  )) as Array<{ index_name: string; is_valid: boolean }>;

  const found = new Set(rows.map((r) => r.index_name));
  const inScope = rows.filter((r) =>
    (EXECUTION_ORDER_TRANSITION_INDEX_NAMES as readonly string[]).includes(r.index_name),
  );
  const invalid = inScope.filter((r) => !r.is_valid).map((r) => r.index_name);
  const valid = inScope.filter((r) => r.is_valid).map((r) => r.index_name);
  const missing = EXECUTION_ORDER_TRANSITION_INDEX_NAMES.filter((n) => !found.has(n));

  return { invalid, valid, missing };
}

export class CreateExecutionOrderStatusTransitions1320000000000 implements MigrationInterface {
  name = 'CreateExecutionOrderStatusTransitions1320000000000';

  /**
   * ADR-066: DDL fuera de TX del runner (CREATE INDEX CONCURRENTLY).
   */
  transactional = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // El enum lo crea la 046; se tolera que esta migración corra en un schema
    // donde la 046 quedó a mitad (mismo patrón idempotente de la 046).
    await queryRunner.query(`
      DO $$
      BEGIN
        CREATE TYPE execution_order_status AS ENUM (
          'CREATED', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS', 'BLOCKED',
          'COMPLETED', 'COMPLETED_WITH_OBSERVATIONS', 'NOT_EXECUTED', 'CANCELLED'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS execution_order_status_transitions (
        id                 UUID                    NOT NULL DEFAULT gen_random_uuid(),
        tenant_id          UUID                    NOT NULL,
        execution_order_id UUID                    NOT NULL,
        from_status        execution_order_status  NOT NULL,
        to_status          execution_order_status  NOT NULL,
        changed_at         TIMESTAMPTZ             NOT NULL,
        changed_by         UUID                    NOT NULL,
        reason             VARCHAR(255),
        created_at         TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_execution_order_status_transitions PRIMARY KEY (id)
      )
    `);

    // —— Historial por OT e instante (spec §4.1, ADR-089 D1) ——
    await dropInvalidExecutionOrderTransitionIndexIfExists(
      queryRunner,
      'idx_execution_order_transitions_order_changed_at',
    );
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_execution_order_transitions_order_changed_at
        ON execution_order_status_transitions (tenant_id, execution_order_id, changed_at)
    `);

    // —— Verificación post-migración: detecta índices INVALID o missing ——
    const verification = await verifyExecutionOrderTransitionIndexes(queryRunner);
    if (verification.invalid.length > 0) {
      console.warn(
        `[132] WARNING: ${verification.invalid.length} transition index(es) INVALID:\n` +
          verification.invalid.map((n) => `  - ${n}`).join('\n') +
          `\nRebuild manually or re-run this migration.`,
      );
    }
    if (verification.missing.length > 0) {
      console.warn(
        `[132] WARNING: ${verification.missing.length} transition index(es) MISSING:\n` +
          verification.missing.map((n) => `  - ${n}`).join('\n') +
          `\nThe CREATE step may have been skipped. Re-run this migration.`,
      );
    }
    if (verification.invalid.length === 0 && verification.missing.length === 0) {
      console.log(`[132] All ${verification.valid.length} transition indexes verified valid.`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS idx_execution_order_transitions_order_changed_at`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS execution_order_status_transitions`);
  }
}
