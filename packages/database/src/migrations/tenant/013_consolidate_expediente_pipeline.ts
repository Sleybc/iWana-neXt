import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 013: Consolidar pipeline de expediente de 12 a 8 estados.
 *
 * Estados eliminados (ADR-026 §Plan de migración):
 * - CONTACTADO → mapear a PRECALIFICADO
 * - PENDIENTE_DATOS → mapear a PRECALIFICADO
 * - VIABLE_COMERCIALMENTE → mapear a VALIDANDO_COBERTURA
 * - PENDIENTE_DECISION → mapear a EN_COTIZACION
 *
 * `status`, `previous_status`, `from_status` y `to_status` son columnas VARCHAR
 * (ver 001_create_expediente_records.ts), no tipos ENUM de PostgreSQL: no hay
 * ningún tipo que recortar y nada impide reescribir los valores antiguos.
 *
 * Reversibilidad: antes de transformar, `up()` copia el estado original de las
 * filas afectadas a la tabla de respaldo `expediente_pipeline_consolidation_backup`
 * dentro del propio schema del tenant. `down()` restaura desde ahí y la elimina.
 *
 * Si no hubo nada que capturar, `up()` elimina la tabla vacía: no deja residuo en
 * el schema. La ausencia de respaldo significa entonces, siempre, "no hay nada que
 * revertir" — y `down()` retorna limpio.
 *
 * Por qué `down()` no falla nunca: tras un `up()` exitoso quedan cero filas en
 * estados eliminados por definición, así que **ningún dato de la base distingue
 * "transformó filas" de "no había filas que transformar"**. El único discriminante
 * posible era la tabla de respaldo. Una versión anterior contaba el total de filas
 * de `expediente_records`/`status_changes` y fallaba si era > 0, lo que producía un
 * falso positivo en todo schema donde la 013 corrió como no-op y los datos llegaron
 * después — es decir, en todo tenant provisionado tras la consolidación.
 *
 * Esto es correcto porque la 013 solo puede transformar datos en un schema que ya
 * tuviera expedientes en estados eliminados al aplicarla. En la cadena actual la 013
 * ocupa la posición 13 de 74 y ninguna migración 001-012 inserta filas en esas
 * tablas: en cualquier schema creado desde la cadena completa, la tabla está vacía
 * al llegar aquí y la migración es un no-op demostrable.
 *
 * Idempotencia: la captura usa ON CONFLICT DO NOTHING y las transformaciones
 * filtran por los estados eliminados, así que re-ejecutar `up()` no duplica el
 * respaldo ni altera datos ya consolidados.
 */
const BACKUP_TABLE = 'expediente_pipeline_consolidation_backup';

const LEGACY_STATUSES =
  "'CONTACTADO', 'PENDIENTE_DATOS', 'VIABLE_COMERCIALMENTE', 'PENDIENTE_DECISION'";

export class ConsolidateExpedientePipeline1700000000013 implements MigrationInterface {
  name = 'ConsolidateExpedientePipeline1700000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Captura previa (reversibilidad) --------------------------------
    // Vive en el schema del tenant: search_path lo fija el runner por conexión.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ${BACKUP_TABLE} (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        source_table VARCHAR(40) NOT NULL,
        record_id UUID NOT NULL,
        status VARCHAR(40),
        previous_status VARCHAR(40),
        from_status VARCHAR(30),
        to_status VARCHAR(30),
        captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_${BACKUP_TABLE} PRIMARY KEY (id),
        CONSTRAINT uq_${BACKUP_TABLE}_record UNIQUE (source_table, record_id)
      )
    `);

    // Cubre tanto las filas cuyo status se consolida como aquellas donde solo
    // previous_status arrastra un estado eliminado (residual, líneas de abajo).
    await queryRunner.query(`
      INSERT INTO ${BACKUP_TABLE} (source_table, record_id, status, previous_status)
      SELECT 'expediente_records', id, status, previous_status
      FROM expediente_records
      WHERE status IN (${LEGACY_STATUSES})
         OR previous_status IN (${LEGACY_STATUSES})
      ON CONFLICT (source_table, record_id) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO ${BACKUP_TABLE} (source_table, record_id, from_status, to_status)
      SELECT 'status_changes', id, from_status, to_status
      FROM status_changes
      WHERE from_status IN (${LEGACY_STATUSES})
         OR to_status IN (${LEGACY_STATUSES})
      ON CONFLICT (source_table, record_id) DO NOTHING
    `);

    // --- Consolidación (lógica original, sin cambios: ADR-026) ----------
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

    // --- Limpieza: sin capturas, la tabla de respaldo no deja residuo -----
    // Es el caso normal (schema nuevo: la 013 es no-op). Su ausencia equivale
    // a "nada que revertir", que es justo lo que down() necesita saber.
    if ((await this.countBackupRows(queryRunner)) === 0) {
      await queryRunner.query(`DROP TABLE IF EXISTS ${BACKUP_TABLE}`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Sin tabla de respaldo no hay nada que revertir: o `up()` no capturó nada
    // (no-op) o la eliminó por quedar vacía. Ver la nota de cabecera sobre por
    // qué ningún dato de la base puede distinguir más que esto.
    if (!(await this.hasBackupTable(queryRunner))) {
      return;
    }

    await queryRunner.query(`
      UPDATE expediente_records er
      SET status = b.status,
          previous_status = b.previous_status
      FROM ${BACKUP_TABLE} b
      WHERE b.source_table = 'expediente_records'
        AND er.id = b.record_id
    `);

    await queryRunner.query(`
      UPDATE status_changes sc
      SET from_status = b.from_status,
          to_status = b.to_status
      FROM ${BACKUP_TABLE} b
      WHERE b.source_table = 'status_changes'
        AND sc.id = b.record_id
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS ${BACKUP_TABLE}`);
  }

  private async hasBackupTable(queryRunner: QueryRunner): Promise<boolean> {
    const rows = (await queryRunner.query(`SELECT to_regclass($1) IS NOT NULL AS present`, [
      BACKUP_TABLE,
    ])) as Array<{ present: boolean }>;

    return rows[0]?.present === true;
  }

  private async countBackupRows(queryRunner: QueryRunner): Promise<number> {
    const rows = (await queryRunner.query(
      `SELECT COUNT(*)::int AS total FROM ${BACKUP_TABLE}`,
    )) as Array<{ total: number }>;

    return rows[0]?.total ?? 0;
  }
}
