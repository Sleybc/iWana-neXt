import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 128 — Endurecimiento de `purchase_request_line_awards` y rescate
 * de solicitudes varadas (MOD12 Compras · Fase 30 · track BE-1; ADR-087
 * propuesto, decisiones D3 y D4).
 *
 * DDL aditivo y reversible:
 * - Columnas `unit_cost NUMERIC(14,2)` y `currency VARCHAR(3)`, ambas
 *   nullables: el costo resuelto de la adjudicación (derivado de la línea de
 *   cotización o aportado por la escotilla de proveedor sin cotización).
 * - Índice único `uq_pr_line_awards_line_party` sobre
 *   `(tenant_id, purchase_request_line_id, awarded_party_ref_id)`:
 *   TRES columnas a propósito — dos romperían el reparto por cantidad de las
 *   solicitudes PROJECT (una línea puede repartirse entre varios proveedores;
 *   lo que no puede haber es DOS filas del mismo proveedor sobre la misma
 *   línea).
 * - CHECK `chk_pr_line_awards_qty_positive` (`awarded_quantity > 0`): una
 *   adjudicación de cantidad cero o negativa no tiene sentido de negocio.
 * - `CREATE INDEX IF NOT EXISTS idx_purchase_request_line_awards_tenant_party`:
 *   la migración original 049 YA crea este índice, así que en una base al día
 *   es un no-op; se re-emite como red de deriva para que toda base termine
 *   igual que declara la entidad. Su `down` correspondiente NO lo elimina
 *   (no es suyo: lo posee la 049).
 *
 * Dedupe previo (pre-vuelo + borrado): conserva la fila MÁS ANTIGUA
 * (`created_at` asc, `id` como desempate) por
 * `(tenant_id, purchase_request_line_id, awarded_party_ref_id)`. Si una misma
 * línea acumula duplicados de DISTINTOS proveedores, la migración FALLA
 * ruidosamente listando cada par (línea, proveedor): elegir qué proveedor
 * conserva la adjudicación es una decisión de negocio, no de la migración.
 * Duplicados de un único proveedor sobre la línea son ambigüedad mecánica y
 * se resuelven solo.
 *
 * Backfill (ADR-087 propuesto, D4): toda solicitud `CONVERTED_TO_PO` que
 * conserve ALGUNA línea en `OPEN | PENDING_QUOTE | AWARDED` vuelve a
 * `APPROVED` — el defecto «solicitud varada»: una orden parcial la marcaba
 * consumida para siempre e impedía terminar de convertirla. El conteo previo
 * queda en el log de la migración (sin PII).
 *
 * El `down` revierte constraints, columnas e índice propio, pero NO revierte
 * el backfill: devolver las solicitudes a `CONVERTED_TO_PO` volvería a varar
 * solicitudes legítimas (el mismo defecto que esta migración corrige). La
 * corrección es idempotente y no destructiva; re-correr `up` tras un `down`
 * vuelve a detectar y rescatar lo que corresponda.
 *
 * Todo el DDL usa `IF NOT EXISTS` (o guardas por catálogo para el CHECK):
 * `up` es re-ejecutable.
 */
export class HardenPurchaseRequestLineAwards1280000000000 implements MigrationInterface {
  name = 'HardenPurchaseRequestLineAwards1280000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.assertNoNonPositiveAwardQuantity(queryRunner);
    await this.assertNoMultiPartyDuplicateConflicts(queryRunner);
    await this.dedupeOldestPerLineAndParty(queryRunner);

    await queryRunner.query(`
      ALTER TABLE purchase_request_line_awards
        ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(14, 2)
    `);

    await queryRunner.query(`
      ALTER TABLE purchase_request_line_awards
        ADD COLUMN IF NOT EXISTS currency VARCHAR(3)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_pr_line_awards_line_party
        ON purchase_request_line_awards (tenant_id, purchase_request_line_id, awarded_party_ref_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_purchase_request_line_awards_tenant_party
        ON purchase_request_line_awards (tenant_id, awarded_party_ref_id)
    `);

    await this.addQuantityPositiveCheck(queryRunner);
    await this.backfillStrandedConvertedRequests(queryRunner);
  }

  /**
   * Reversible salvo el backfill (ver JSDoc de la clase): constraints,
   * columnas e índice único propio se sueltan; el índice tenant+party no se
   * toca (creado por la 049) y las solicitudes rescatadas permanecen en
   * `APPROVED`.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'chk_pr_line_awards_qty_positive'
            AND conrelid = 'purchase_request_line_awards'::regclass
        ) THEN
          ALTER TABLE purchase_request_line_awards
            DROP CONSTRAINT chk_pr_line_awards_qty_positive;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS uq_pr_line_awards_line_party`);

    await queryRunner.query(`
      ALTER TABLE purchase_request_line_awards
        DROP COLUMN IF EXISTS unit_cost
    `);

    await queryRunner.query(`
      ALTER TABLE purchase_request_line_awards
        DROP COLUMN IF EXISTS currency
    `);
  }

  /** Pre-vuelo A: cantidades adjudicadas <= 0 que el CHECK nuevo rechazaría. */
  private async assertNoNonPositiveAwardQuantity(queryRunner: QueryRunner): Promise<void> {
    const invalid = await this.countRows(
      queryRunner,
      `
      SELECT COUNT(*) AS total
      FROM purchase_request_line_awards
      WHERE awarded_quantity <= 0
    `,
    );

    if (invalid > 0) {
      throw new Error(
        `[128 pre-vuelo A] ${invalid} adjudicación(es) con awarded_quantity <= 0. ` +
          `Corregir o anular esas filas antes de reintentar la migración.`,
      );
    }
  }

  /**
   * Pre-vuelo B: la misma línea con duplicados de MÁS DE UN proveedor. El
   * dedupe mecánico (conservar la más antigua por línea+proveedor) preservaría
   * los dos proveedores a la vez sin poder saber si el más nuevo era un
   * reemplazo; decidirlo no es decisión de la migración. Aborta listando cada
   * par (purchase_request_line_id, awarded_party_ref_id) en conflicto.
   */
  private async assertNoMultiPartyDuplicateConflicts(queryRunner: QueryRunner): Promise<void> {
    const conflicts =
      ((await queryRunner.query(`
        SELECT duplicado.purchase_request_line_id AS "lineId",
               duplicado.awarded_party_ref_id AS "partyId"
        FROM (
          SELECT tenant_id, purchase_request_line_id, awarded_party_ref_id
          FROM purchase_request_line_awards
          GROUP BY tenant_id, purchase_request_line_id, awarded_party_ref_id
          HAVING COUNT(*) > 1
        ) AS duplicado
      `)) as Array<{ lineId: string; partyId: string }> | undefined) ?? [];

    const partiesByLine = new Map<string, Set<string>>();
    for (const row of conflicts) {
      const parties = partiesByLine.get(row.lineId) ?? new Set<string>();
      parties.add(row.partyId);
      partiesByLine.set(row.lineId, parties);
    }

    const conflictedLines = [...partiesByLine.entries()].filter(([, parties]) => parties.size > 1);

    if (conflictedLines.length === 0) {
      return;
    }

    const detail = conflictedLines
      .map(([lineId, parties]) => `linea=${lineId} proveedores=${[...parties].sort().join(', ')}`)
      .join('; ');

    throw new Error(
      `[128 pre-vuelo B] ${conflictedLines.length} línea(s) con adjudicaciones duplicadas de ` +
        `distintos proveedores: ${detail}. ` +
        `Decidir qué proveedor conserva la adjudicación es una decisión de negocio: ` +
        `corregir los datos antes de reintentar la migración.`,
    );
  }

  /**
   * Dedupe mecánico: por (tenant, línea, proveedor) conserva la fila más
   * antigua (`created_at` asc, `id` asc como desempate) y borra el resto.
   * Idempotente: re-correrlo no elimina nada nuevo.
   */
  private async dedupeOldestPerLineAndParty(queryRunner: QueryRunner): Promise<void> {
    const duplicated = await this.countRows(
      queryRunner,
      `
      SELECT COALESCE(SUM(total - 1), 0) AS total
      FROM (
        SELECT COUNT(*) AS total
        FROM purchase_request_line_awards
        GROUP BY tenant_id, purchase_request_line_id, awarded_party_ref_id
        HAVING COUNT(*) > 1
      ) AS duplicados
    `,
    );

    if (duplicated > 0) {
      console.log(
        `[128] Dedupe: ${duplicated} adjudicación(es) duplicadas (mismo proveedor y línea) serán reducidas a la más antigua.`,
      );
    }

    await queryRunner.query(`
      DELETE FROM purchase_request_line_awards victima
      USING purchase_request_line_awards conservada
      WHERE victima.tenant_id = conservada.tenant_id
        AND victima.purchase_request_line_id = conservada.purchase_request_line_id
        AND victima.awarded_party_ref_id = conservada.awarded_party_ref_id
        AND (conservada.created_at < victima.created_at
             OR (conservada.created_at = victima.created_at
                 AND conservada.id < victima.id))
    `);
  }

  /**
   * CHECK con guarda por catálogo: PostgreSQL no admite
   * `ADD CONSTRAINT IF NOT EXISTS`, así que la existencia se consulta en
   * `pg_constraint` acotada a la tabla (resuelta vía `search_path`, igual que
   * el resto del DDL sin calificar de esta migración).
   */
  private async addQuantityPositiveCheck(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'chk_pr_line_awards_qty_positive'
            AND conrelid = 'purchase_request_line_awards'::regclass
        ) THEN
          ALTER TABLE purchase_request_line_awards
            ADD CONSTRAINT chk_pr_line_awards_qty_positive
            CHECK (awarded_quantity > 0);
        END IF;
      END
      $$;
    `);
  }

  /**
   * Backfill D4: `CONVERTED_TO_PO` con al menos una línea viva
   * (`OPEN | PENDING_QUOTE | AWARDED`) vuelve a `APPROVED`. El conteo previo
   * queda en el log: es el dato que necesita el informe de fase.
   */
  private async backfillStrandedConvertedRequests(queryRunner: QueryRunner): Promise<void> {
    const stranded = await this.countRows(
      queryRunner,
      `
      SELECT COUNT(*) AS total
      FROM purchase_requests r
      WHERE r.status = 'CONVERTED_TO_PO'
        AND EXISTS (
          SELECT 1
          FROM purchase_request_lines l
          WHERE l.purchase_request_id = r.id
            AND l.line_status IN ('OPEN', 'PENDING_QUOTE', 'AWARDED')
        )
    `,
    );

    console.log(
      `[128] Backfill: ${stranded} solicitud(es) CONVERTED_TO_PO con líneas vivas vuelven a APPROVED.`,
    );

    await queryRunner.query(`
      UPDATE purchase_requests r
      SET status = 'APPROVED',
          updated_at = NOW()
      WHERE r.status = 'CONVERTED_TO_PO'
        AND EXISTS (
          SELECT 1
          FROM purchase_request_lines l
          WHERE l.purchase_request_id = r.id
            AND l.line_status IN ('OPEN', 'PENDING_QUOTE', 'AWARDED')
        )
    `);
  }

  private async countRows(queryRunner: QueryRunner, sql: string): Promise<number> {
    const rows = ((await queryRunner.query(sql)) as Array<{ total: string }> | undefined) ?? [];

    return Number(rows[0]?.total ?? 0);
  }
}
