import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 126 — Grupo de seriales por línea de salida (MOD12 S2 · B2).
 *
 * Tabla hija `stock_issue_line_serials`: una fila por serial comprometido.
 * - `issue_status` (enum `stock_issue_status` creado por 057) espeja el estado
 *   de la cabecera y habilita el índice único parcial: PostgreSQL no admite
 *   predicados que referencien otras tablas (ajuste G1).
 * - FK a `stock_issue_lines` con CASCADE (delete + reinsert del borrador).
 * - FK a `stock_issues` con RESTRICT: un borrado accidental de la cabecera
 *   no debe liberar seriales comprometidos en silencio (ajuste AI-DATA-ENG).
 *
 * Backfill: cada línea con `serialized_asset_id` singular nace autoritativa
 * en la hija; a partir de aquí el grupo es la fuente de compromiso de seriales
 * y el singular queda como campo de transición.
 */
export class CreateStockIssueLineSerials1260000000000 implements MigrationInterface {
  name = 'CreateStockIssueLineSerials1260000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE stock_issue_line_serials (
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
      CREATE INDEX idx_stock_issue_line_serials_line
        ON stock_issue_line_serials (line_id, created_at)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_stock_issue_line_serials_active_asset
        ON stock_issue_line_serials (tenant_id, serialized_asset_id)
        WHERE issue_status NOT IN ('DISPATCHED', 'RECEIVED', 'CANCELLED')
    `);

    // Backfill: la hija nace autoritativa a partir del singular de S1.
    await queryRunner.query(`
      INSERT INTO stock_issue_line_serials
        (tenant_id, line_id, issue_id, issue_status, serialized_asset_id, created_at, updated_at)
      SELECT l.tenant_id, l.id, l.issue_id, i.status, l.serialized_asset_id, NOW(), NOW()
      FROM stock_issue_lines l
      JOIN stock_issues i ON i.id = l.issue_id
      WHERE l.serialized_asset_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS stock_issue_line_serials`);
  }
}
