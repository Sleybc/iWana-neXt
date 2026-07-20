import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * NO REVERTIR EL TIMESTAMP DE ESTA CLASE (renumerada 2026-07-19).
 *
 * Esta migracion nacio con el sufijo `1700000000014`, MENOR que el de las
 * migraciones 001-011 (`1741766400000`..`1746164800000`).
 * TypeORM ordena la cadena por el timestamp del NOMBRE DE CLASE, no por el del
 * fichero ni por el prefijo numerico del nombre de archivo. Sobre una base
 * limpia las 012-016 corrian ANTES de `CreatePublicSchema1741766400000` y
 * `pnpm --filter @iwana/db migration:run` fallaba con
 * `relation "public.platform_audit_logs" does not exist`.
 *
 * En `dbiw` no se notaba porque 001-011 ya estaban aplicadas: el defecto
 * solo aparece en CI limpio, en el bootstrap de staging/prod y en cualquier
 * entorno nuevo — es decir, justo en el camino documentado.
 *
 * El sufijo actual (`17844192xx000`, 2026-07-19) es DELIBERADO y debe
 * quedar por encima del maximo de la cadena previa. Bajarlo reintroduce el fallo.
 * Las cinco migraciones renumeradas son idempotentes, condicion necesaria para
 * renumerar: las bases que ya las tenian registradas con el nombre viejo las
 * vuelven a ejecutar como si fueran nuevas.
 *
 * La cadena tenant no sufre esto: `tenant/runner.ts` usa un array ordenado
 * explicito en vez de delegar el orden en el timestamp.
 */

/**
 * Migración 014: hace `platform_audit_logs` realmente inmutable.
 *
 * `001_create_public_schema.ts` afirmaba en sus comentarios que la tabla es
 * append-only con retención de 7 años. **No lo era, por tres motivos
 * independientes:**
 *
 * 1. La política se llama `pal_insert_only` pero es
 *    `AS RESTRICTIVE ... FOR ALL ... USING (TRUE)`. Una política restrictiva se
 *    añade con AND al calificador; `TRUE` no restringe nada. Permitía UPDATE y
 *    DELETE.
 * 2. El `REVOKE` de privilegios destructivos que el comentario anuncia **no
 *    existe como sentencia**: son tres líneas de comentario que además
 *    mencionan una variable `DB_APP_ROLE` inexistente en el repo.
 * 3. RLS estaba `ENABLE` pero no `FORCE`, y la aplicación conectaba como **dueña**
 *    de la tabla. Los dueños saltan RLS no forzada incondicionalmente.
 *
 * El resultado: un docstring prometía una garantía que nadie tenía, y alguien
 * iba a confiar en ella.
 *
 * ### Por qué un trigger y no RLS o REVOKE
 *
 * `REVOKE` no surte efecto sobre el dueño de la tabla, que tiene privilegios
 * implícitos. `FORCE ROW LEVEL SECURITY` sí alcanzaría al dueño, pero deja la
 * garantía repartida entre política y flag, y un `ALTER TABLE` posterior puede
 * desactivarla sin ruido. Un trigger `BEFORE UPDATE OR DELETE` que lanza
 * excepción es explícito, funciona con cualquier rol y aparece en el error.
 *
 * Tras retirar la política hay que `DISABLE ROW LEVEL SECURITY`: dejar RLS
 * ENABLE sin políticas deniega INSERT a cualquier rol que no sea owner
 * (p. ej. `iwana_app` tras SEC-04).
 *
 * ### La escotilla, y por qué existe
 *
 * Bloquear toda mutación para siempre haría imposible remediar una fuga: la
 * migración 012 tuvo que redactar 4 contraseñas que el saneado defectuoso del
 * interceptor había escrito en claro. Si vuelve a ocurrir, hará falta el mismo
 * recurso.
 *
 * Por eso el trigger cede ante `iwana.audit_maintenance = 'on'`, que debe
 * fijarse con `SET LOCAL` dentro de la transacción que lo necesite — es decir,
 * dentro de una migración revisable en git, no de una sesión suelta de psql.
 * No es un agujero: es la diferencia entre una mutación deliberada y trazable y
 * una accidental.
 */
export class EnforcePlatformAuditImmutability1784419203000 implements MigrationInterface {
  name = 'EnforcePlatformAuditImmutability1784419203000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.reject_audit_mutation()
      RETURNS TRIGGER AS $$
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
      $$ LANGUAGE plpgsql
    `);

    // La política anterior sugería una garantía que no daba: se retira para no
    // dejar dos mecanismos donde solo uno actúa.
    await queryRunner.query(
      `DROP POLICY IF EXISTS "pal_insert_only" ON public.platform_audit_logs`,
    );

    // RLS ENABLE sin políticas deniega todo a no-owners. Con SEC-04 el owner es
    // iwana_migrator y el runtime (iwana_app) debe poder INSERT; la inmutabilidad
    // queda en el trigger, no en RLS.
    await queryRunner.query(`ALTER TABLE public.platform_audit_logs DISABLE ROW LEVEL SECURITY`);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_platform_audit_logs_immutable ON public.platform_audit_logs
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_platform_audit_logs_immutable
        BEFORE UPDATE OR DELETE ON public.platform_audit_logs
        FOR EACH ROW EXECUTE FUNCTION public.reject_audit_mutation()
    `);

    await queryRunner.query(`
      COMMENT ON TABLE public.platform_audit_logs IS
        'Registro de auditoria de plataforma. Solo escritura: un trigger rechaza UPDATE y DELETE con independencia del rol. Remediaciones deliberadas via SET LOCAL iwana.audit_maintenance = ''on'' desde una migracion.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_platform_audit_logs_immutable ON public.platform_audit_logs
    `);
    // La función se conserva: la comparte el trigger de los schemas de tenant.
  }
}
