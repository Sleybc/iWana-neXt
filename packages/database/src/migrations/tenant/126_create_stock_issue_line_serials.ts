import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 126 — Grupo de seriales por línea de salida (MOD12 S2 · B2, refactorizada S2.1 · B1).
 *
 * Tabla hija `stock_issue_line_serials`: una fila por serial comprometido.
 * - `issue_status` (enum `stock_issue_status` creado por 057) espeja el estado
 *   de la cabecera y habilita el índice único parcial: PostgreSQL no admite
 *   predicados que referencien otras tablas (ajuste G1).
 * - FK a `stock_issue_lines` con CASCADE (delete + reinsert del borrador).
 * - FK a `stock_issues` con RESTRICT: un borrado accidental de la cabecera
 *   no debe liberar seriales comprometidos en silencio (ajuste AI-DATA-ENG).
 * - H8 (diseño, dictamen DATA-ENG S2.1 §3.1): la hija NO tiene FK hacia
 *   `serialized_assets`. La integridad serial ↔ activo vive en la aplicación
 *   (validador de grupos en el borde + pre-chequeo amable + índice único
 *   parcial como red de carrera); una FK dura acoplaría el ciclo de vida del
 *   activo al de la salida y bloquearía reciclajes legítimos.
 *
 * Backfill: cada línea con `serialized_asset_id` singular nace autoritativa
 * en la hija, heredando `created_at`/`updated_at` de la línea (no `NOW()`:
 * la hija no debe parecer más nueva que su origen); a partir de aquí el grupo
 * es la fuente de compromiso de seriales y el singular queda como campo de
 * transición. El backfill es idempotente (`NOT EXISTS` por (línea, serial)):
 * re-correr `up` no duplica filas. El `ON CONFLICT` apunta explícitamente al
 * índice único parcial y no a «cualquier conflicto»: solo la carrera contra
 * ese índice se descarta en silencio; un choque de PK sigue reventando.
 *
 * Volumen: si algún tenant supera 5.000 singulares, el backfill corre por
 * rangos de `l.id` en lotes de 1.000 (keyset, sin OFFSET) para no retener
 * transacciones largas; por debajo del umbral va en una sola sentencia.
 *
 * Pre-vuelo (abortan con conteo, sin PII): 0a líneas con serial huérfanas
 * (sin cabecera), 0b `tenant_id` de la línea distinto del de su cabecera, 0c
 * colisiones activas (mismo serial comprometido por más de una salida no
 * terminal) sobre el universo completo de compromisos: los ya materializados
 * en la hija más los candidatos del backfill.
 * Post-vuelo (abortan con conteo): cobertura (todo singular con réplica en
 * la hija) y espejo (toda fila hija con `issue_status` igual al de su cabecera).
 *
 * Todo el DDL usa `IF NOT EXISTS`: `up` es re-ejecutable.
 */
export class CreateStockIssueLineSerials1260000000000 implements MigrationInterface {
  name = 'CreateStockIssueLineSerials1260000000000';

  /** Estados que ya no comprometen seriales (paridad con `SERIAL_COMMIT_TERMINAL_STATUSES` del API). */
  private static readonly TERMINAL_STATUSES = ['DISPATCHED', 'RECEIVED', 'CANCELLED'];

  /** Umbral del dictamen DATA-ENG: por encima, backfill por rangos de `l.id`. */
  private static readonly BACKFILL_RANGE_THRESHOLD = 5000;

  /** Tamaño del lote del backfill por rangos. */
  private static readonly BACKFILL_BATCH_SIZE = 1000;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.assertPreflightClean(queryRunner);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stock_issue_line_serials (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        line_id UUID NOT NULL,
        issue_id UUID NOT NULL,
        issue_status stock_issue_status NOT NULL,
        serialized_asset_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_stock_issue_line_serials PRIMARY KEY (id),
        CONSTRAINT fk_stock_issue_line_serials_line
          FOREIGN KEY (line_id)
          REFERENCES stock_issue_lines (id)
          ON DELETE CASCADE,
        CONSTRAINT fk_stock_issue_line_serials_issue
          FOREIGN KEY (issue_id)
          REFERENCES stock_issues (id)
          ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_issue_line_serials_line
        ON stock_issue_line_serials (line_id, created_at)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_issue_line_serials_issue
        ON stock_issue_line_serials (tenant_id, issue_id)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_issue_line_serials_active_asset
        ON stock_issue_line_serials (tenant_id, serialized_asset_id)
        WHERE issue_status NOT IN ('DISPATCHED', 'RECEIVED', 'CANCELLED')
    `);

    await this.backfillSerialGroups(queryRunner);
    await this.assertPostflightClean(queryRunner);
  }

  /**
   * `down` LOSSY (documentado): la tabla hija se respalda en
   * `stock_issue_line_serials_backup_126` antes de soltarla. El primer respaldo
   * gana: si ya existe, se conserva (es el estado previo al primer `down`).
   * Pérdida conocida: al re-correr `up`, los grupos de N>1 seriales renacen
   * solo con su primer serial (el singular de transición); el resto vive
   * únicamente en la tabla de respaldo.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    const exists = await this.childTableExists(queryRunner);

    if (!exists) {
      return;
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stock_issue_line_serials_backup_126 AS
      SELECT * FROM stock_issue_line_serials
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS stock_issue_line_serials`);
  }

  /**
   * ¿Existe ya la tabla hija? Se resuelve con `to_regclass`, que sigue la ruta
   * de búsqueda de la sesión igual que el DDL sin calificar de esta migración.
   *
   * `QueryRunner.hasTable()` NO sirve aquí: resuelve el schema contra
   * `options.schema` del DataSource, no contra la sesión. Un runner que fije la
   * ruta por conexión y deje `options.schema` en su valor por defecto obtiene
   * `false` para una tabla que sí existe — y entonces `down` se convierte en un
   * no-op silencioso y el pre-vuelo 0c en una sonda ciega.
   */
  private async childTableExists(queryRunner: QueryRunner): Promise<boolean> {
    const present = await this.countRows(
      queryRunner,
      `SELECT CASE WHEN to_regclass('stock_issue_line_serials') IS NULL THEN 0 ELSE 1 END AS total`,
    );

    return present > 0;
  }

  private async countRows(
    queryRunner: QueryRunner,
    sql: string,
    params: unknown[] = [],
  ): Promise<number> {
    const rows =
      ((await queryRunner.query(sql, params)) as Array<{ total: string }> | undefined) ?? [];

    return Number(rows[0]?.total ?? 0);
  }

  /**
   * Pre-vuelo 0a: líneas con serial cuya cabecera no existe. El backfill hace
   * `JOIN` interior: las huérfanas se perderían en silencio sin este freno.
   */
  private async assertNoOrphanSerialLines(queryRunner: QueryRunner): Promise<void> {
    const orphans = await this.countRows(
      queryRunner,
      `
        SELECT COUNT(*) AS total
        FROM stock_issue_lines l
        WHERE l.serialized_asset_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM stock_issues i WHERE i.id = l.issue_id)
      `,
    );

    if (orphans > 0) {
      throw new Error(
        `[126 pre-vuelo 0a] ${orphans} línea(s) con serial sin salida asociada. ` +
          `Corregir los datos antes de reintentar la migración.`,
      );
    }
  }

  /** Pre-vuelo 0b: `tenant_id` de la línea distinto del de su cabecera. */
  private async assertNoTenantMismatch(queryRunner: QueryRunner): Promise<void> {
    const mismatched = await this.countRows(
      queryRunner,
      `
        SELECT COUNT(*) AS total
        FROM stock_issue_lines l
        JOIN stock_issues i ON i.id = l.issue_id
        WHERE l.serialized_asset_id IS NOT NULL
          AND l.tenant_id <> i.tenant_id
      `,
    );

    if (mismatched > 0) {
      throw new Error(
        `[126 pre-vuelo 0b] ${mismatched} línea(s) con serial cuyo tenant difiere del de su salida. ` +
          `Corregir los datos antes de reintentar la migración.`,
      );
    }
  }

  /** Lista de estados terminales lista para interpolar en SQL. */
  private static terminalStatusList(): string {
    return CreateStockIssueLineSerials1260000000000.TERMINAL_STATUSES.map(
      (status) => `'${status}'`,
    ).join(', ');
  }

  /**
   * Proyección del universo de compromisos activos de serial *tras* el backfill:
   * filas activas ya materializadas en la hija ∪ singulares que el backfill
   * aún debe copiar. Sobre la primera ejecución la hija no existe y la
   * proyección se reduce a los singulares.
   */
  private activeCommitmentsSql(childTableExists: boolean): string {
    const terminal = CreateStockIssueLineSerials1260000000000.terminalStatusList();
    const materialized = childTableExists
      ? `
          SELECT hija.tenant_id, hija.serialized_asset_id
          FROM stock_issue_line_serials hija
          WHERE hija.issue_status NOT IN (${terminal})
          UNION ALL`
      : '';
    // Un singular ya replicado se cuenta por su fila hija, no dos veces.
    const pendingReplicaOnly = childTableExists
      ? `
            AND NOT EXISTS (
              SELECT 1 FROM stock_issue_line_serials replica
              WHERE replica.line_id = l.id
                AND replica.serialized_asset_id = l.serialized_asset_id
            )`
      : '';

    return `${materialized}
          SELECT l.tenant_id, l.serialized_asset_id
          FROM stock_issue_lines l
          JOIN stock_issues i ON i.id = l.issue_id
          WHERE l.serialized_asset_id IS NOT NULL
            AND i.status NOT IN (${terminal})${pendingReplicaOnly}`;
  }

  /**
   * Pre-vuelo 0c: el mismo serial comprometido por más de una salida no
   * terminal. El índice único parcial rechazaría el backfill sin este freno.
   *
   * El universo de compromisos no es solo el singular de la línea: tras el
   * primer `up` la fuente autoritativa es la hija, y un grupo puede comprometer
   * seriales que no viven en el singular de transición (ese es justamente el
   * objetivo de S2). Una sonda que solo mirara `stock_issue_lines` es ciega a
   * esos compromisos, deja pasar el pre-vuelo y el `INSERT` del backfill choca
   * contra `uq_stock_issue_line_serials_active_asset`: el `ON CONFLICT` lo
   * descarta y el hueco solo aparece aguas abajo, en el post-vuelo de
   * cobertura, sin nombrar la causa (defecto S2.1 · B1). La sonda cuenta las
   * tuplas (tenant, serial) con más de un compromiso activo proyectado, que es
   * exactamente lo que el índice único parcial rechazaría.
   */
  private async assertNoActiveCollisions(queryRunner: QueryRunner): Promise<void> {
    // Misma resolución de nombre que el DDL (ver `childTableExists`): con
    // `hasTable()` esta sonda quedaba ciega a la hija ya existente, la
    // proyección omitía los compromisos materializados y el pre-vuelo dejaba
    // pasar la colisión hasta el post-vuelo de cobertura.
    const childTableExists = await this.childTableExists(queryRunner);
    const collisions = await this.countRows(
      queryRunner,
      `
        SELECT COUNT(*) AS total FROM (
          SELECT compromisos.tenant_id, compromisos.serialized_asset_id
          FROM (${this.activeCommitmentsSql(childTableExists)}
          ) AS compromisos
          GROUP BY compromisos.tenant_id, compromisos.serialized_asset_id
          HAVING COUNT(*) > 1
        ) AS colisiones
      `,
    );

    if (collisions > 0) {
      throw new Error(
        `[126 pre-vuelo 0c] ${collisions} serial(es) comprometido(s) en más de una salida activa. ` +
          `Resolver los compromisos duplicados antes de reintentar la migración.`,
      );
    }
  }

  private async assertPreflightClean(queryRunner: QueryRunner): Promise<void> {
    await this.assertNoOrphanSerialLines(queryRunner);
    await this.assertNoTenantMismatch(queryRunner);
    await this.assertNoActiveCollisions(queryRunner);
  }

  /**
   * Conflicto acotado al índice único parcial: solo la carrera contra
   * `uq_stock_issue_line_serials_active_asset` se descarta en silencio (el
   * pre-vuelo 0c ya la descartó en frío). Un `ON CONFLICT DO NOTHING` desnudo
   * tragaría también choques de PK, que deben reventar.
   */
  private static conflictTargetSql(): string {
    return `ON CONFLICT (tenant_id, serialized_asset_id)
        WHERE issue_status NOT IN (${CreateStockIssueLineSerials1260000000000.terminalStatusList()})
        DO NOTHING`;
  }

  private backfillInsertSql(rangeFilter: string, paged: boolean): string {
    const paging = paged
      ? `ORDER BY l.id LIMIT ${CreateStockIssueLineSerials1260000000000.BACKFILL_BATCH_SIZE}`
      : '';
    return `
      INSERT INTO stock_issue_line_serials
        (tenant_id, line_id, issue_id, issue_status, serialized_asset_id, created_at, updated_at)
      SELECT l.tenant_id, l.id, l.issue_id, i.status, l.serialized_asset_id, l.created_at, l.updated_at
      FROM stock_issue_lines l
      JOIN stock_issues i ON i.id = l.issue_id
      WHERE l.serialized_asset_id IS NOT NULL
        ${rangeFilter}
        AND NOT EXISTS (
          SELECT 1 FROM stock_issue_line_serials s
          WHERE s.line_id = l.id AND s.serialized_asset_id = l.serialized_asset_id
        )
      ${paging}
      ${CreateStockIssueLineSerials1260000000000.conflictTargetSql()}
    `;
  }

  private async backfillSerialGroups(queryRunner: QueryRunner): Promise<void> {
    const perTenant =
      ((await queryRunner.query(
        `
          SELECT tenant_id AS "tenantId", COUNT(*) AS total
          FROM stock_issue_lines
          WHERE serialized_asset_id IS NOT NULL
          GROUP BY tenant_id
        `,
      )) as Array<{ tenantId: string; total: string }> | undefined) ?? [];
    const maxSingulars = perTenant.reduce((max, row) => Math.max(max, Number(row.total)), 0);

    if (maxSingulars <= CreateStockIssueLineSerials1260000000000.BACKFILL_RANGE_THRESHOLD) {
      await queryRunner.query(this.backfillInsertSql('', false));
      return;
    }

    // Volumen alto: keyset por `l.id` (comparación escalar con cast, sin
    // arreglos). La sonda lista lo pendiente real (`NOT EXISTS`): cada lote
    // inserta exactamente lo sondado y el cursor avanza al último id.
    let lastId: string | null = null;
    for (;;) {
      const pending: Array<{ id: string }> =
        ((await queryRunner.query(
          `
            SELECT l.id AS id
            FROM stock_issue_lines l
            WHERE l.serialized_asset_id IS NOT NULL
              AND ($1::uuid IS NULL OR l.id > $1::uuid)
              AND NOT EXISTS (
                SELECT 1 FROM stock_issue_line_serials s
                WHERE s.line_id = l.id AND s.serialized_asset_id = l.serialized_asset_id
              )
            ORDER BY l.id LIMIT ${CreateStockIssueLineSerials1260000000000.BACKFILL_BATCH_SIZE}
          `,
          [lastId],
        )) as Array<{ id: string }> | undefined) ?? [];

      if (pending.length === 0) {
        break;
      }

      const firstId = pending[0]?.id;
      const batchLastId = pending[pending.length - 1]?.id;

      if (!firstId || !batchLastId) {
        break;
      }

      await queryRunner.query(
        `
          INSERT INTO stock_issue_line_serials
            (tenant_id, line_id, issue_id, issue_status, serialized_asset_id, created_at, updated_at)
          SELECT l.tenant_id, l.id, l.issue_id, i.status, l.serialized_asset_id, l.created_at, l.updated_at
          FROM stock_issue_lines l
          JOIN stock_issues i ON i.id = l.issue_id
          WHERE l.serialized_asset_id IS NOT NULL
            AND l.id >= $1::uuid AND l.id <= $2::uuid
            AND NOT EXISTS (
              SELECT 1 FROM stock_issue_line_serials s
              WHERE s.line_id = l.id AND s.serialized_asset_id = l.serialized_asset_id
            )
          ${CreateStockIssueLineSerials1260000000000.conflictTargetSql()}
        `,
        [firstId, batchLastId],
      );

      lastId = batchLastId;
    }
  }

  /**
   * Post-vuelo cobertura: todo singular con cabecera tiene su réplica en la hija.
   */
  private async assertBackfillCoverage(queryRunner: QueryRunner): Promise<void> {
    const missing = await this.countRows(
      queryRunner,
      `
        SELECT COUNT(*) AS total
        FROM stock_issue_lines l
        JOIN stock_issues i ON i.id = l.issue_id
        WHERE l.serialized_asset_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM stock_issue_line_serials s
            WHERE s.line_id = l.id AND s.serialized_asset_id = l.serialized_asset_id
          )
      `,
    );

    if (missing > 0) {
      throw new Error(
        `[126 post-vuelo cobertura] ${missing} línea(s) con singular sin réplica en la hija. ` +
          `Revisar el backfill antes de continuar.`,
      );
    }
  }

  /** Post-vuelo espejo: 0 filas hijas con `issue_status` divergente de su cabecera. */
  private async assertMirrorAligned(queryRunner: QueryRunner): Promise<void> {
    const divergent = await this.countRows(
      queryRunner,
      `
        SELECT COUNT(*) AS total
        FROM stock_issue_line_serials s
        JOIN stock_issues i ON i.id = s.issue_id
        WHERE s.issue_status <> i.status
      `,
    );

    if (divergent > 0) {
      throw new Error(
        `[126 post-vuelo espejo] ${divergent} fila(s) hija(s) con issue_status divergente de su salida. ` +
          `Revisar la sincronización de la espejo antes de continuar.`,
      );
    }
  }

  private async assertPostflightClean(queryRunner: QueryRunner): Promise<void> {
    await this.assertBackfillCoverage(queryRunner);
    await this.assertMirrorAligned(queryRunner);
  }
}
