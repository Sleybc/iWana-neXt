import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 136: la anulación por error viaja sobre `status = CANCELLED` con
 * discriminador propio (MOD11 T2, ADR-090 §D3).
 *
 * Mecanismo deliberado (ver informe T2): NO se crea un estado terminal nuevo.
 * Todas las listas que enumeran terminalidad a mano —índice único de origen
 * (135), purga de retención (134, `TERMINAL_STATUSES_SQL`), transiciones
 * (132), backfills de plantilla (118, 131) y las listas literales del
 * servicio— ya contienen `CANCELLED`. Un estado nuevo obligaría a tocarlas
 * todas; olvidar una sola dejaría el origen bloqueado o la línea de tiempo
 * sin anonimizar. El discriminador `is_annulled` distingue la anulada de la
 * cancelada en el dato y en la consulta sin añadir ninguna fuente de verdad
 * de terminalidad.
 *
 * - `is_annulled` solo tiene sentido con `status = 'CANCELLED'`: el CHECK lo
 *   impone en base, no solo en código.
 * - `NOT NULL DEFAULT false`: las filas existentes nacen no-anuladas; el
 *   `ADD COLUMN` con default es solo-metadatos en PostgreSQL (apto en línea).
 */
export class ExecutionOrderAnnulmentFlag1360000000000 implements MigrationInterface {
  name = 'ExecutionOrderAnnulmentFlag1360000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE execution_orders
        ADD COLUMN IF NOT EXISTS is_annulled boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE execution_orders
        DROP CONSTRAINT IF EXISTS chk_execution_orders_annulled_cancelled
    `);
    await queryRunner.query(`
      ALTER TABLE execution_orders
        ADD CONSTRAINT chk_execution_orders_annulled_cancelled
        CHECK (is_annulled = false OR status = 'CANCELLED')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Límite declarado (patrón de la 135): revertir destruye la distinción
    // anulada/cancelada. Con filas anuladas vivas, ningún consentimiento lo
    // vuelve válido —la vía sería borrar OTs, prohibido—; sin ellas revierte
    // limpio. Sin bypass por variable de entorno.
    const rows = (await queryRunner.query(
      `SELECT COUNT(*)::int AS total
         FROM execution_orders
        WHERE is_annulled = true`,
    )) as Array<{ total: number }>;
    const affected = rows[0]?.total ?? 0;
    if (affected > 0) {
      throw new Error(
        `Rollback de ExecutionOrderAnnulmentFlag bloqueado: ` +
          `${affected} OT(s) anulada(s) perderían su distinción frente a la cancelación operativa. ` +
          `Revierta esas anulaciones por camino gobernado antes de revertir; ` +
          `este down no borra OTs ni admite bypass.`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE execution_orders
        DROP CONSTRAINT IF EXISTS chk_execution_orders_annulled_cancelled
    `);
    await queryRunner.query(`
      ALTER TABLE execution_orders
        DROP COLUMN IF EXISTS is_annulled
    `);
  }
}
