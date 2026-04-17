import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 013: Consolidar pipeline de expediente de 12 a 8 estados.
 *
 * Estados eliminados (ADR-026):
 * - CONTACTADO → mapear a PRECALIFICADO
 * - PENDIENTE_DATOS → mapear a PRECALIFICADO
 * - VIABLE_COMERCIALMENTE → mapear a VALIDANDO_COBERTURA
 * - PENDIENTE_DECISION → mapear a EN_COTIZACION
 *
 * Esta migración NO elimina los valores del enum de PostgreSQL inmediatamente.
 * Se deja para una migración posterior después de verificar que no hay
 * referencias pendientes en producción.
 */
export class ConsolidateExpedientePipeline1700000000013 implements MigrationInterface {
  name = 'ConsolidateExpedientePipeline1700000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Mapear registros en expediente_records con estados eliminados
    await queryRunner.query(`
      UPDATE expediente_records
      SET status = 'PRECALIFICADO',
          previous_status = CASE
            WHEN previous_status IN ('CONTACTADO', 'PENDIENTE_DATOS') THEN 'NUEVO_POTENCIAL'
            ELSE previous_status
          END
      WHERE status IN ('CONTACTADO', 'PENDIENTE_DATOS')
    `);

    await queryRunner.query(`
      UPDATE expediente_records
      SET status = 'VALIDANDO_COBERTURA',
          previous_status = CASE
            WHEN previous_status = 'VIABLE_COMERCIALMENTE' THEN 'PRECALIFICADO'
            ELSE previous_status
          END
      WHERE status = 'VIABLE_COMERCIALMENTE'
    `);

    await queryRunner.query(`
      UPDATE expediente_records
      SET status = 'EN_COTIZACION',
          previous_status = CASE
            WHEN previous_status = 'PENDIENTE_DECISION' THEN 'VALIDANDO_COBERTURA'
            ELSE previous_status
          END
      WHERE status = 'PENDIENTE_DECISION'
    `);

    // Actualizar registros en status_changes que referencien estados eliminados
    await queryRunner.query(`
      UPDATE status_changes
      SET from_status = 'PRECALIFICADO'
      WHERE from_status IN ('CONTACTADO', 'PENDIENTE_DATOS')
    `);

    await queryRunner.query(`
      UPDATE status_changes
      SET to_status = 'PRECALIFICADO'
      WHERE to_status IN ('CONTACTADO', 'PENDIENTE_DATOS')
    `);

    await queryRunner.query(`
      UPDATE status_changes
      SET from_status = 'VALIDANDO_COBERTURA'
      WHERE from_status = 'VIABLE_COMERCIALMENTE'
    `);

    await queryRunner.query(`
      UPDATE status_changes
      SET to_status = 'VALIDANDO_COBERTURA'
      WHERE to_status = 'VIABLE_COMERCIALMENTE'
    `);

    await queryRunner.query(`
      UPDATE status_changes
      SET from_status = 'EN_COTIZACION'
      WHERE from_status = 'PENDIENTE_DECISION'
    `);

    await queryRunner.query(`
      UPDATE status_changes
      SET to_status = 'EN_COTIZACION'
      WHERE to_status = 'PENDIENTE_DECISION'
    `);

    // Actualizar previous_status residual en expediente_records
    await queryRunner.query(`
      UPDATE expediente_records
      SET previous_status = 'PRECALIFICADO'
      WHERE previous_status IN ('CONTACTADO', 'PENDIENTE_DATOS')
    `);

    await queryRunner.query(`
      UPDATE expediente_records
      SET previous_status = 'VALIDANDO_COBERTURA'
      WHERE previous_status = 'VIABLE_COMERCIALMENTE'
    `);

    await queryRunner.query(`
      UPDATE expediente_records
      SET previous_status = 'EN_COTIZACION'
      WHERE previous_status = 'PENDIENTE_DECISION'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No es posible revertir automáticamente el mapeo de estados
    // porque la información original se pierde en la consolidación.
    // La reversión requiere restaurar desde backup.
    throw new Error(
      'Rollback de ConsolidateExpedientePipeline no soportado. ' +
        'Restaurar desde backup si es necesario.',
    );
  }
}
