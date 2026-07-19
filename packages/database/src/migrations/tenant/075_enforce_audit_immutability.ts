import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 075: hace `<schema>.audit_logs` realmente inmutable.
 *
 * Contraparte de la pública 014. La migración inicial sí emitía
 * `REVOKE DELETE/UPDATE ... FROM PUBLIC` sobre esta tabla —a diferencia de la
 * de plataforma, donde el REVOKE era solo un comentario—, pero **no surte
 * efecto**: la aplicación conecta como dueña de la tabla y los dueños tienen
 * privilegios implícitos que `REVOKE ... FROM PUBLIC` no toca. La política
 * `audit_logs_no_mutate` tiene el mismo defecto que su gemela pública: es
 * `RESTRICTIVE ... USING (TRUE)`, que no restringe nada. Y RLS está `ENABLE`
 * pero no `FORCE`, de modo que el dueño la salta igualmente.
 *
 * Se usa la función `public.reject_audit_mutation()` que crea la migración 014:
 * es común a todos los schemas y evita una copia por tenant.
 *
 * La escotilla `iwana.audit_maintenance = 'on'` existe por la misma razón que
 * allí — la migración 074 tuvo que redactar una contraseña filtrada— y debe
 * fijarse con `SET LOCAL` desde una migración revisable, no desde una sesión
 * suelta.
 */
export class EnforceAuditImmutability0750000000000 implements MigrationInterface {
  name = 'EnforceAuditImmutability0750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // La política anterior prometía una garantía que no daba: se retira para no
    // dejar dos mecanismos donde solo uno actúa.
    await queryRunner.query(`DROP POLICY IF EXISTS audit_logs_no_mutate ON audit_logs`);

    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs`);

    await queryRunner.query(`
      CREATE TRIGGER trg_audit_logs_immutable
        BEFORE UPDATE OR DELETE ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION public.reject_audit_mutation()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs`);
  }
}
