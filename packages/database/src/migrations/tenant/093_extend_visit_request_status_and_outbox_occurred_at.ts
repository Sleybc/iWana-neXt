import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 093: extiende VisitRequestStatus con IN_EXECUTION, CLOSED,
 * REQUIRES_RESCHEDULE (DATA-P0-1) y agrega occurred_at al outbox (DATA-P1-1).
 *
 * Schema: tenant (search_path)
 * Reversible: sí para occurred_at; PostgreSQL no soporta quitar valores de un enum.
 *
 * ADR-068: Matriz de convergencia §"Agregar estados a VisitRequestStatus requiere
 * migración tenant versionada y reversible."
 */
export class ExtendVisitRequestStatusAndOutboxOccurredAt0930000000000 implements MigrationInterface {
  name = 'ExtendVisitRequestStatusAndOutboxOccurredAt0930000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // DATA-P0-1: Extender el enum visit_request_status
    await queryRunner.query(
      `ALTER TYPE visit_request_status ADD VALUE IF NOT EXISTS 'IN_EXECUTION'`,
    );
    await queryRunner.query(`ALTER TYPE visit_request_status ADD VALUE IF NOT EXISTS 'CLOSED'`);
    await queryRunner.query(
      `ALTER TYPE visit_request_status ADD VALUE IF NOT EXISTS 'REQUIRES_RESCHEDULE'`,
    );

    // DATA-P1-1: Agregar occurred_at al outbox
    await queryRunner.query(
      `ALTER TABLE execution_order_outbox_events
       ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ`,
    );

    // Actualizar filas existentes: occurred_at = created_at para eventos ya escritos
    await queryRunner.query(
      `UPDATE execution_order_outbox_events
       SET occurred_at = created_at
       WHERE occurred_at IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE execution_order_outbox_events
       ALTER COLUMN occurred_at SET DEFAULT NOW()`,
    );
    await queryRunner.query(
      `ALTER TABLE execution_order_outbox_events
       ALTER COLUMN occurred_at SET NOT NULL`,
    );

    // Mejorar índice de pending para incluir lease_until
    await queryRunner.query(`DROP INDEX IF EXISTS idx_execution_order_outbox_pending`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_execution_order_outbox_pending
       ON execution_order_outbox_events (published_at, available_at, lease_until)
       WHERE published_at IS NULL`,
    );
  }

  /**
   * Reversible documental: PostgreSQL no permite quitar valores de un enum.
   *
   * Si es necesario revertir esta migración, el downgrade lógico consiste en
   * aceptar que filas con IN_EXECUTION, CLOSED o REQUIRES_RESCHEDULE existen
   * y no deben producir errores en capas que no reconozcan esos valores.
   *
   * La columna occurred_at se puede eliminar, y el índice se reconstruye en
   * su forma anterior.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      const rows = ((await queryRunner.query(
        `SELECT COUNT(*)::int AS total FROM execution_order_outbox_events WHERE occurred_at IS NOT NULL`,
      )) ?? []) as Array<{ total: number }>;
      const total = rows[0]?.total ?? 0;
      if (total > 0) {
        throw new Error(
          `Rollback de ExtendVisitRequestStatusAndOutboxOccurredAt bloqueado: ` +
            `occurred_at contiene ${total} evento(s). Para continuar de forma destructiva, ` +
            `exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true de forma explícita.`,
        );
      }
    }

    // Reconstruir el índice pending en su forma anterior a 093
    await queryRunner.query(`DROP INDEX IF EXISTS idx_execution_order_outbox_pending`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_execution_order_outbox_pending
       ON execution_order_outbox_events (tenant_id, published_at, available_at)`,
    );

    // Eliminar occurred_at si se requiere revertir el esquema
    await queryRunner.query(
      `ALTER TABLE execution_order_outbox_events
       DROP COLUMN IF EXISTS occurred_at`,
    );

    // NOTA: los valores de enum IN_EXECUTION, CLOSED, REQUIRES_RESCHEDULE
    // no se pueden eliminar del tipo visit_request_status en PostgreSQL.
    // Consulte ADR-068 §"Agregar estados a VisitRequestStatus".
  }
}
