import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

const LEGACY_SCHEDULE_EVENT_STATUS_VALUES = [
  'DRAFT',
  'SCHEDULED',
  'EN_ROUTE',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'RESCHEDULED',
  'NO_SHOW',
] as const;

/**
 * Migración 107: añade EXPIRED al enum schedule_event_status (barrido H2 / ADR-077 D7).
 *
 * Schema: tenant (search_path)
 * Reversible: sí. El down reconstruye el tipo solo si no quedan filas EXPIRED
 * (o con IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true tras reconciliar).
 *
 * Sin este valor, el UPDATE del processor falla en cada tenant y el job BullMQ
 * nunca marca eventos vencidos.
 */
export class AddScheduleEventStatusExpired107 implements MigrationInterface {
  name = 'AddScheduleEventStatusExpired107';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE schedule_event_status ADD VALUE IF NOT EXISTS 'EXPIRED'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const expiredRows = ((await queryRunner.query(
      `SELECT COUNT(*)::int AS total
       FROM schedule_events
       WHERE status::text = 'EXPIRED'`,
    )) ?? []) as Array<{ total: number }>;
    const expiredTotal = expiredRows[0]?.total ?? 0;

    if (expiredTotal > 0 && process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      throw new Error(
        `Rollback de AddScheduleEventStatusExpired107 bloqueado: ` +
          `schedule_events conserva ${expiredTotal} fila(s) EXPIRED. ` +
          `Reconcilie esos estados antes de revertir, o exporte ` +
          `${DESTRUCTIVE_DOWN_ENV_VAR}=true de forma explícita.`,
      );
    }

    if (expiredTotal > 0 && process.env[DESTRUCTIVE_DOWN_ENV_VAR] === 'true') {
      // Destructivo explícito: mapea EXPIRED → CANCELLED para poder recastear.
      await queryRunner.query(
        `UPDATE schedule_events
         SET status = 'CANCELLED'::schedule_event_status
         WHERE status::text = 'EXPIRED'`,
      );
    }

    await queryRunner.query(
      `ALTER TYPE schedule_event_status RENAME TO schedule_event_status_107_extended`,
    );
    await queryRunner.query(
      `CREATE TYPE schedule_event_status AS ENUM (${LEGACY_SCHEDULE_EVENT_STATUS_VALUES.map(
        (value) => `'${value}'`,
      ).join(', ')})`,
    );
    await queryRunner.query(
      `ALTER TABLE schedule_events
       ALTER COLUMN status TYPE schedule_event_status
       USING status::text::schedule_event_status`,
    );
    await queryRunner.query(`DROP TYPE schedule_event_status_107_extended`);
  }
}
