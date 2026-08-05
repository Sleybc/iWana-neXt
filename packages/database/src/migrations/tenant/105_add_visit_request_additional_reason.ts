import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración: Agrega additional_reason a visit_requests para el motivo
 * de la visita adicional cuando isAdditional=true.
 *
 * Schema: tenant (dinámico vía search_path)
 * Reversible: sí
 * ADR-076 D3, MOD09-CICLO-VISITA Fase 3.3
 */
export class AddVisitRequestAdditionalReason105 implements MigrationInterface {
  name = 'AddVisitRequestAdditionalReason105';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE visit_requests
      ADD COLUMN additional_reason TEXT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE visit_requests
      DROP COLUMN additional_reason
    `);
  }
}
