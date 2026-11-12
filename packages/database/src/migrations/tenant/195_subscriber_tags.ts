import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 195 — etiquetas manuales del suscriptor por tenant (ADR-110 D8).
 *
 * `subscriber_tags` es el catálogo del ISP (nombre único sin distinguir mayúsculas entre
 * las vigentes y color `#RRGGBB`); `subscriber_tag_assignments` asigna una etiqueta a un
 * suscriptor. Las etiquetas que iWana deriva (IVA, datos faltantes, Siigo) no viven aquí.
 * `import_batch_id` marca la asignación que trajo un lote de importación (D3).
 *
 * `down()` borra las dos tablas. Si hay etiquetas, lo bloquea salvo
 * `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true`: no hay backfill que las reconstruya.
 */
export class SubscriberTags1950000000195 implements MigrationInterface {
  name = 'SubscriberTags1950000000195';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS subscriber_tags (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        name varchar(40) NOT NULL,
        color varchar(7) NOT NULL,
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL,
        CONSTRAINT chk_subscriber_tags_name CHECK (length(btrim(name)) > 0),
        CONSTRAINT chk_subscriber_tags_color CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriber_tags_live_name
        ON subscriber_tags (tenant_id, lower(btrim(name)))
        WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS subscriber_tag_assignments (
        tenant_id uuid NOT NULL,
        subscriber_id uuid NOT NULL REFERENCES subscribers (id) ON DELETE CASCADE,
        tag_id uuid NOT NULL REFERENCES subscriber_tags (id) ON DELETE CASCADE,
        assigned_by uuid NULL,
        assigned_at timestamptz NOT NULL DEFAULT now(),
        import_batch_id uuid NULL,
        PRIMARY KEY (subscriber_id, tag_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_subscriber_tag_assignments_tag
        ON subscriber_tag_assignments (tenant_id, tag_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_subscriber_tag_assignments_import_batch
        ON subscriber_tag_assignments (import_batch_id)
        WHERE import_batch_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      const exists = (await queryRunner.query(
        `SELECT to_regclass('subscriber_tags') IS NOT NULL AS present`,
      )) as Array<{ present: boolean }>;
      if (exists[0]?.present) {
        const rows = (await queryRunner.query(
          `SELECT COUNT(*)::int AS total FROM subscriber_tags`,
        )) as Array<{ total: number }>;
        const total = rows[0]?.total ?? 0;
        if (total > 0) {
          throw new Error(
            `Migración 195: hay ${total} etiqueta(s) de suscriptor; ` +
              `define ${DESTRUCTIVE_DOWN_ENV_VAR}=true para revertir.`,
          );
        }
      }
    }
    await queryRunner.query(`DROP TABLE IF EXISTS subscriber_tag_assignments`);
    await queryRunner.query(`DROP TABLE IF EXISTS subscriber_tags`);
  }
}
