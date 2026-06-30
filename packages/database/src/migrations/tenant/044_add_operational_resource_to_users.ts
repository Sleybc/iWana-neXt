import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Habilita la capacidad explícita de despacho operativo sobre users.
 *
 * Regla de negocio:
 * - cualquier usuario interno puede ser agendado
 * - solo los usuarios marcados como recurso operativo aparecen en despacho
 *
 * Backfill conservador:
 * - TECHNICIAN y CONTRACTOR quedan operativos por defecto
 * - el resto permanece en false hasta revisión administrativa
 */
export class AddOperationalResourceToUsers1749733200044 implements MigrationInterface {
  name = 'AddOperationalResourceToUsers1749733200044';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS is_operational_resource BOOLEAN NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      UPDATE users
         SET is_operational_resource = true
       WHERE role IN ('TECHNICIAN', 'CONTRACTOR')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN IF EXISTS is_operational_resource
    `);
  }
}
