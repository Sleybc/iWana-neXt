import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 196 — identidad de origen de la importación en suscriptores, contratos y
 * tickets (ADR-110 D3).
 *
 * - `subscribers` ya tiene `external_id` (012): gana `import_batch_id` y el índice único
 *   parcial por tenant. Si el schema trae `external_id` repetidos, `up()` aborta con el
 *   conteo (sin valores) en vez de elegir cuál conservar.
 * - `contracts` y `support_tickets` ganan `external_id` (`uisp:<entidad>:<id>`) e
 *   `import_batch_id`, con el mismo índice único parcial.
 *
 * Promover dos veces el mismo `external_id` choca con el índice: repetir un lote no
 * duplica. `import_batch_id` no lleva FK hacia `migration_batches` (plataforma) para no
 * acoplar tablas de CRM y Soporte a otro módulo; la reversión filtra por él.
 *
 * `down()` retira índices y columnas nuevas. Si alguna fila tiene `import_batch_id` o un
 * `external_id` en contratos o tickets, lo bloquea salvo
 * `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true`: la traza del lote no se reconstruye.
 * `subscribers.external_id` se conserva (es de la 012).
 */
export class ImportExternalIdsCrmSupport1960000000196 implements MigrationInterface {
  name = 'ImportExternalIdsCrmSupport1960000000196';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const duplicates = (await queryRunner.query(`
      SELECT COUNT(*)::int AS total FROM (
        SELECT tenant_id, external_id FROM subscribers
         WHERE external_id IS NOT NULL
         GROUP BY tenant_id, external_id
        HAVING COUNT(*) > 1
      ) repeated
    `)) as Array<{ total: number }>;
    if ((duplicates[0]?.total ?? 0) > 0) {
      throw new Error(
        `Migración 196: ${duplicates[0]?.total} external_id repetido(s) en subscribers; ` +
          'depúrelos antes de crear el índice único.',
      );
    }

    await queryRunner.query(`
      ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS import_batch_id uuid NULL
    `);
    await queryRunner.query(`
      ALTER TABLE contracts
        ADD COLUMN IF NOT EXISTS external_id varchar(160) NULL,
        ADD COLUMN IF NOT EXISTS import_batch_id uuid NULL
    `);
    await queryRunner.query(`
      ALTER TABLE support_tickets
        ADD COLUMN IF NOT EXISTS external_id varchar(160) NULL,
        ADD COLUMN IF NOT EXISTS import_batch_id uuid NULL
    `);

    for (const table of ['subscribers', 'contracts', 'support_tickets']) {
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_${table}_external_id
          ON ${table} (tenant_id, external_id)
          WHERE external_id IS NOT NULL
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_${table}_import_batch
          ON ${table} (import_batch_id)
          WHERE import_batch_id IS NOT NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(`
      SELECT (SELECT COUNT(*) FROM subscribers WHERE import_batch_id IS NOT NULL)::int
           + (SELECT COUNT(*) FROM contracts
               WHERE import_batch_id IS NOT NULL OR external_id IS NOT NULL)::int
           + (SELECT COUNT(*) FROM support_tickets
               WHERE import_batch_id IS NOT NULL OR external_id IS NOT NULL)::int AS total
    `)) as Array<{ total: number }>;
    const total = rows[0]?.total ?? 0;
    if (total > 0 && process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      throw new Error(
        `Migración 196: ${total} fila(s) traen datos de importación; ` +
          `define ${DESTRUCTIVE_DOWN_ENV_VAR}=true para revertir.`,
      );
    }

    for (const table of ['subscribers', 'contracts', 'support_tickets']) {
      await queryRunner.query(`DROP INDEX IF EXISTS idx_${table}_import_batch`);
      await queryRunner.query(`DROP INDEX IF EXISTS uq_${table}_external_id`);
    }
    await queryRunner.query(`
      ALTER TABLE support_tickets
        DROP COLUMN IF EXISTS import_batch_id,
        DROP COLUMN IF EXISTS external_id
    `);
    await queryRunner.query(`
      ALTER TABLE contracts
        DROP COLUMN IF EXISTS import_batch_id,
        DROP COLUMN IF EXISTS external_id
    `);
    await queryRunner.query(`ALTER TABLE subscribers DROP COLUMN IF EXISTS import_batch_id`);
  }
}
