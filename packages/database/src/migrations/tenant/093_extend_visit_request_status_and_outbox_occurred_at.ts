import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

const LEGACY_VISIT_REQUEST_STATUS_VALUES = [
  'PENDING',
  'NEEDS_CONTEXT',
  'READY_TO_SCHEDULE',
  'SCHEDULED',
  'CANCELLED',
  'REJECTED',
  'EXPIRED',
] as const;

/**
 * Migración 093: extiende VisitRequestStatus con IN_EXECUTION, CLOSED,
 * REQUIRES_RESCHEDULE (DATA-P0-1) y agrega occurred_at al outbox (DATA-P1-1).
 *
 * Schema: tenant (search_path)
 * Reversible: sí. El down reconstruye visit_request_status con los valores
 * históricos, pero bloquea si aún existen filas con estados introducidos por
 * esta migración: mapearlas silenciosamente perdería semántica operativa.
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

    // Backfill por lotes para no mantener un UPDATE monolítico sobre el outbox.
    // La ventana se ordena por la PK, por lo que es estable y re-ejecutable.
    await queryRunner.query(`
      DO $migration$
      DECLARE
        affected INTEGER;
      BEGIN
        LOOP
          WITH batch AS (
            SELECT id
            FROM execution_order_outbox_events
            WHERE occurred_at IS NULL
            ORDER BY id
            LIMIT 500
          )
          UPDATE execution_order_outbox_events target
          SET occurred_at = target.created_at
          FROM batch
          WHERE target.id = batch.id;

          GET DIAGNOSTICS affected = ROW_COUNT;
          EXIT WHEN affected = 0;
        END LOOP;
      END
      $migration$
    `);
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
    const extendedStatusRows = ((await queryRunner.query(
      `SELECT COUNT(*)::int AS total
       FROM visit_requests
       WHERE status::text IN ('IN_EXECUTION', 'CLOSED', 'REQUIRES_RESCHEDULE')`,
    )) ?? []) as Array<{ total: number }>;
    const extendedStatusTotal = extendedStatusRows[0]?.total ?? 0;
    if (extendedStatusTotal > 0) {
      throw new Error(
        `Rollback de ExtendVisitRequestStatusAndOutboxOccurredAt bloqueado: ` +
          `visit_requests conserva ${extendedStatusTotal} fila(s) con estados de 093. ` +
          `Reconcilie esos estados a un valor histórico antes de revertir; no se aplica ` +
          `un mapeo automático con pérdida semántica.`,
      );
    }

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

    // PostgreSQL no soporta DROP VALUE en enums. Como ninguna fila conserva
    // los estados nuevos (guard al inicio), se reconstruye el tipo y se
    // recastea la columna sin perder datos históricos.
    await queryRunner.query(
      `ALTER TYPE visit_request_status RENAME TO visit_request_status_093_extended`,
    );
    await queryRunner.query(
      `CREATE TYPE visit_request_status AS ENUM (${LEGACY_VISIT_REQUEST_STATUS_VALUES.map((value) => `'${value}'`).join(', ')})`,
    );
    await queryRunner.query(
      `ALTER TABLE visit_requests
       ALTER COLUMN status TYPE visit_request_status
       USING status::text::visit_request_status`,
    );
    await queryRunner.query(`DROP TYPE visit_request_status_093_extended`);
  }
}
