import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 180 — notas manuales del suscriptor (MOD05 ficha estilo UISP, bloque D, D3).
 *
 * Schema tenant. Crea `subscriber_note`: registro aparte de la auditoría, de solo
 * inserción (la API no edita ni borra). `body_encrypted` guarda el texto libre
 * cifrado con AES-256-GCM (mismo mecanismo que `crm_lifecycle_changes.note_encrypted`);
 * el límite de 2000 caracteres y el no vacío se validan sobre la entrada (Zod y
 * servicio), porque el CHECK no ve el texto plano. La supresión del titular lo
 * sustituye por el marcador cifrado (CrmTitularErasureParticipant).
 *
 * `down()` borra la tabla. Si ya hay notas lo bloquea salvo
 * `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true`: no existe backfill que las reconstruya.
 */
export class SubscriberNote1800000000180 implements MigrationInterface {
  name = 'SubscriberNote1800000000180';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS subscriber_note (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        subscriber_id uuid NOT NULL REFERENCES subscribers (id),
        body_encrypted text NOT NULL,
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_subscriber_note_body_encrypted CHECK (length(body_encrypted) > 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_subscriber_note_subscriber_created
        ON subscriber_note (subscriber_id, created_at DESC, id DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      const exists = (await queryRunner.query(
        `SELECT to_regclass('subscriber_note') IS NOT NULL AS present`,
      )) as Array<{ present: boolean }>;
      if (exists[0]?.present) {
        const rows = (await queryRunner.query(
          `SELECT COUNT(*)::int AS total FROM subscriber_note`,
        )) as Array<{ total: number }>;
        const total = rows[0]?.total ?? 0;
        if (total > 0) {
          throw new Error(
            `Rollback de SubscriberNote bloqueado: la tabla contiene ${total} nota(s). ` +
              `Para continuar de forma destructiva, exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true.`,
          );
        }
      }
    }
    await queryRunner.query(`DROP INDEX IF EXISTS idx_subscriber_note_subscriber_created`);
    await queryRunner.query(`DROP TABLE IF EXISTS subscriber_note`);
  }
}
