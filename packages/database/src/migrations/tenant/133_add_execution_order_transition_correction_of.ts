import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 133 — `correction_of_id` en los asientos de transición (MOD11, adenda B1c).
 *
 * Decisión AI-EM-ARCH (adenda B1c a B1 del prompt
 * `docs/prompts/PROMPT-MOD11-LINEA-TIEMPO-T1-v1.0.md`): B1 no previó el campo
 * de referencia al asiento corregido que spec §4.3 exige ("un asiento nuevo
 * que referencia al corregido"); citar el id en `reason` contaminaría un campo
 * con finalidad operativa declarada ante sec-eng (dictamen B3 §2) y se
 * descarta. Se añade columna propia.
 *
 * DDL aditivo y reversible:
 * - `correction_of_id UUID` NULLABLE, sin DEFAULT. Nullable a propósito: el
 *   asiento original nunca es corrección (B1 registra `correctionOfId: null`)
 *   y la columna no puede inventar un vínculo para el historial ya escrito;
 *   sin backfill (spec §4.5: no se reconstruye historial).
 * - Sin FK — convención MOD11: vínculo lógico como `execution_order_id` (ver
 *   entidad `ExecutionOrderStatusTransition`); la inmutabilidad la sostiene el
 *   servicio (ADR-089 §D3), no la base.
 * - Sin índice: `postgresql` no lo justifica en tabla nueva/casi vacía y T1 no
 *   define ninguna ruta de consulta por esta columna (la lógica de corrección
 *   y la superficie de consulta son B2/T3, fuera de alcance). T3 agregará el
 *   índice que su lectura exija, con su propio dictamen sec-eng.
 *
 * Finalidad (dictamen B3 §2): integridad del historial — corrección aditiva,
 * original visible (CA-04). Retención B3 §3: la corrección no reinicia el
 * plazo de su OT.
 *
 * Schema tenant (`search_path` del runner; sin prefijo explícito). Sin DML
 * (regla ADR-066 §4). Cero PII.
 */
export class AddExecutionOrderTransitionCorrectionOf1330000000000 implements MigrationInterface {
  name = 'AddExecutionOrderTransitionCorrectionOf1330000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE execution_order_status_transitions
        ADD COLUMN IF NOT EXISTS correction_of_id UUID
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE execution_order_status_transitions
        DROP COLUMN IF EXISTS correction_of_id
    `);
  }
}
