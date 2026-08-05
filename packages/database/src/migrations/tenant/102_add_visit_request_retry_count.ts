import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración: Agrega retry_count a visit_requests para el contador de
 * intentos de visita no realizada imputables al cliente.
 *
 * Schema: tenant (dinámico vía search_path)
 * Reversible: sí
 * ADR-077 D6, MOD09-CICLO-VISITA Fase 2
 */
export class AddVisitRequestRetryCount102 implements MigrationInterface {
  name = 'AddVisitRequestRetryCount102';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE visit_requests
      ADD COLUMN retry_count INT NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE visit_requests
      DROP COLUMN retry_count
    `);
  }
}
