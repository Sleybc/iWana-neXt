import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Amplía las tareas de suplantación e incorpora las dos obligaciones nuevas a solicitudes abiertas.
 * El down conserva las filas nuevas: si existen, exige resolverlas antes de volver al CHECK antiguo.
 */
export class PrivacyDenunciaOperador1720000000172 implements MigrationInterface {
  name = 'PrivacyDenunciaOperador1720000000172';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE data_subject_request_tasks
      DROP CONSTRAINT IF EXISTS ck_data_subject_request_tasks_kind
    `);
    await queryRunner.query(`
      ALTER TABLE data_subject_request_tasks
      ADD CONSTRAINT ck_data_subject_request_tasks_kind
      CHECK (kind IN (
        'SUSPENDER_COBRO_EXTERNO',
        'ENTREGAR_COPIA_DOCUMENTOS',
        'FORMULAR_DENUNCIA_OPERADOR',
        'COMUNICAR_PLAZO_DENUNCIA'
      ))
    `);

    const rows = (await queryRunner.query(`
      WITH pending AS (
        SELECT r.id AS request_id,
               'FORMULAR_DENUNCIA_OPERADOR'::varchar(40) AS kind,
               r.impersonation_complaint_due_at AS due_at
        FROM data_subject_requests r
        WHERE r.kind = 'SUPLANTACION'
          AND r.status NOT IN ('RESUELTA', 'NO_PROCEDENTE', 'TRASLADADA')
          AND NOT EXISTS (
            SELECT 1 FROM data_subject_request_tasks task
            WHERE task.request_id = r.id
              AND task.kind = 'FORMULAR_DENUNCIA_OPERADOR'
          )
        UNION ALL
        SELECT r.id AS request_id,
               'COMUNICAR_PLAZO_DENUNCIA'::varchar(40) AS kind,
               r.received_at::date AS due_at
        FROM data_subject_requests r
        WHERE r.kind = 'SUPLANTACION'
          AND r.status NOT IN ('RESUELTA', 'NO_PROCEDENTE', 'TRASLADADA')
          AND NOT EXISTS (
            SELECT 1 FROM data_subject_request_tasks task
            WHERE task.request_id = r.id
              AND task.kind = 'COMUNICAR_PLAZO_DENUNCIA'
          )
      ), inserted AS (
        INSERT INTO data_subject_request_tasks (request_id, kind, due_at)
        SELECT request_id, kind, due_at
        FROM pending
        RETURNING id
      )
      SELECT COUNT(*)::text AS count FROM inserted
    `)) as Array<{ count: string }>;

    console.log(`[172] privacy denuncia backfill inserted=${rows[0]?.count ?? '0'}`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(`
      SELECT COUNT(*)::text AS count
      FROM data_subject_request_tasks
      WHERE kind IN ('FORMULAR_DENUNCIA_OPERADOR', 'COMUNICAR_PLAZO_DENUNCIA')
    `)) as Array<{ count: string }>;
    const count = rows[0]?.count ?? '0';

    if (count !== '0') {
      throw new Error(
        `No se puede revertir la migración 172: existen ${count} tareas nuevas; no se eliminó ninguna fila.`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE data_subject_request_tasks
      DROP CONSTRAINT IF EXISTS ck_data_subject_request_tasks_kind
    `);
    await queryRunner.query(`
      ALTER TABLE data_subject_request_tasks
      ADD CONSTRAINT ck_data_subject_request_tasks_kind
      CHECK (kind IN ('SUSPENDER_COBRO_EXTERNO', 'ENTREGAR_COPIA_DOCUMENTOS'))
    `);
  }
}
