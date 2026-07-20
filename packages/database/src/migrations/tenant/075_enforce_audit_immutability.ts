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
 * Se usa la función `public.reject_audit_mutation()`: es común a todos los
 * schemas y evita una copia del cuerpo por tenant.
 *
 * ### Por qué esta migración provisiona la función en vez de asumirla
 *
 * La función la crea la pública 014, pero la cadena tenant **no depende de la
 * cadena public** en ningún otro punto: 000-074 se aplican sin problema sobre
 * una base donde `public` está vacío. Dar por hecho aquí un objeto de otro
 * schema era un acoplamiento oculto y no declarado, y hacía fallar el alta de
 * tenants con `function public.reject_audit_mutation() does not exist` en
 * cualquier base donde la cadena public no se hubiera aplicado antes (CI,
 * arneses de prueba, bootstrap por partes).
 *
 * Se resuelve declarando la dependencia en vez de tolerarla: si la función no
 * existe, esta migración la crea. **No se optó por saltar el trigger cuando
 * falta**, porque eso degrada la garantía justo donde importa — dejaría
 * `audit_logs` mutable en silencio, que es exactamente el defecto que esta
 * migración corrige.
 *
 * `IF NOT EXISTS` y no `CREATE OR REPLACE`: si la función ya existe puede
 * pertenecer a otro rol (la 015 la reasigna a `iwana_migrator`), y un
 * `CREATE OR REPLACE` desde un rol distinto del dueño falla con 42501. Al no
 * tocarla cuando está presente, la 014 sigue siendo la fuente de verdad de su
 * cuerpo y esta copia solo actúa como red. **Si cambia el cuerpo en la 014,
 * cambiarlo también aquí.**
 *
 * La escotilla `iwana.audit_maintenance = 'on'` existe por la misma razón que
 * allí — la migración 074 tuvo que redactar una contraseña filtrada— y debe
 * fijarse con `SET LOCAL` desde una migración revisable, no desde una sesión
 * suelta.
 */
export class EnforceAuditImmutability0750000000000 implements MigrationInterface {
  name = 'EnforceAuditImmutability0750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Dependencia declarada, no asumida: la crea la pública 014, pero la cadena
    // tenant debe poder aplicarse sobre una base sin `public` migrado.
    // Cuerpo idéntico al de la 014 — mantener ambos en sinc.
    await queryRunner.query(`
      DO $ensure$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname = 'reject_audit_mutation'
        ) THEN
          EXECUTE $create$
            CREATE FUNCTION public.reject_audit_mutation()
            RETURNS TRIGGER AS $fn$
            BEGIN
              IF coalesce(current_setting('iwana.audit_maintenance', true), '') = 'on' THEN
                RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
              END IF;

              RAISE EXCEPTION
                'El registro de auditoria es de solo escritura: % sobre %.% esta prohibido. '
                'Para una remediacion deliberada (por ejemplo redactar un secreto filtrado), '
                'ejecutela desde una migracion con SET LOCAL iwana.audit_maintenance = ''on''.',
                TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
                USING ERRCODE = 'insufficient_privilege';
            END;
            $fn$ LANGUAGE plpgsql
          $create$;
        END IF;
      END
      $ensure$
    `);

    // La política anterior prometía una garantía que no daba: se retira para no
    // dejar dos mecanismos donde solo uno actúa.
    await queryRunner.query(`DROP POLICY IF EXISTS audit_logs_no_mutate ON audit_logs`);

    // Misma trampa que la pública 014: RLS ENABLE sin políticas + owner migrator
    // bloquea INSERT del runtime. La inmutabilidad queda en el trigger.
    await queryRunner.query(`ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY`);

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
