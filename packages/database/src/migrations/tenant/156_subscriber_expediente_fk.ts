import { MigrationInterface, QueryRunner } from 'typeorm';

/** Migración 156: agrega la FK del expediente con preflight explícito de huérfanos. */
export class SubscriberExpedienteForeignKey1560000000000 implements MigrationInterface {
  name = 'SubscriberExpedienteForeignKey1560000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const orphans = (await queryRunner.query(`
      SELECT s.id AS orphan_subscriber_id,
             s.expediente_id,
             COUNT(*) OVER ()::int AS orphan_count
        FROM subscribers s
        LEFT JOIN expediente_records e ON e.id = s.expediente_id
       WHERE s.expediente_id IS NOT NULL
         AND e.id IS NULL
       ORDER BY s.id
       LIMIT 50
    `)) as Array<{
      orphan_subscriber_id: string;
      expediente_id: string;
      orphan_count: number;
    }>;

    if (orphans.length > 0) {
      const orphanCount = orphans[0]?.orphan_count ?? orphans.length;
      const report = orphans
        .map(
          ({ orphan_subscriber_id, expediente_id }) =>
            `subscriber_id=${orphan_subscriber_id}, expediente_id=${expediente_id}`,
        )
        .join('; ');
      throw new Error(
        `Migración 156 abortada: ${orphanCount} suscriptores tienen expediente_id sin expediente. Resolver antes de crear la FK. Huérfanos (máx. 50): ${report}`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE subscribers
        ADD CONSTRAINT fk_subscribers_expediente_id
        FOREIGN KEY (expediente_id) REFERENCES expediente_records(id) ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE subscribers
        DROP CONSTRAINT IF EXISTS fk_subscribers_expediente_id
    `);
  }
}
