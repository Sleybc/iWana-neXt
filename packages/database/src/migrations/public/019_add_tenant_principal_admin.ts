import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 019 — ADR-063 (opción B): `public.tenants.principal_admin_user_id`.
 *
 * El «administrador principal» del tenant era una regla derivada en aplicación
 * (`UsersService.isPrincipalAdminUser`: el ADMIN activo de menor `created_at`).
 * Al eliminarse ese usuario, el principal cambiaba **en silencio** al siguiente
 * ADMIN más antiguo. La designación pasa a ser un atributo explícito del
 * agregado `tenants` — donde ya vive `contact_email`, que es lo que la regla
 * sincroniza— y su transferencia, una operación auditada.
 *
 * BACKFILL: usa exactamente la regla anterior (ADMIN activo más antiguo por
 * `created_at`) para que **no cambie quién es principal en ningún tenant
 * existente**. Un tenant sin ADMIN activo queda en NULL: la regla derivada
 * tampoco señalaba a nadie ahí, así que NULL es fiel al estado previo, no una
 * pérdida de información.
 *
 * Nullable a propósito: un tenant en PROVISIONING todavía no tiene usuarios.
 * Un `NOT NULL` obligaría a inventar un valor durante el alta.
 *
 * Sin FK: la columna vive en `public` y apunta a `<schema_tenant>.users`. Una FK
 * cross-schema no es expresable aquí, y es la misma decisión que ya toma
 * `users.tenant_id` en sentido inverso.
 *
 * El backfill tolera schemas registrados en `public.tenants` cuya tabla `users`
 * no exista todavía (provisioning a medias): los omite en vez de abortar. No hay
 * dato que preservar en ellos.
 *
 * Reversible: `down()` retira la columna. Se pierde la designación explícita y
 * el sistema vuelve a la regla derivada — que es el estado anterior exacto.
 */
export class AddTenantPrincipalAdmin1784419207000 implements MigrationInterface {
  name = 'AddTenantPrincipalAdmin1784419207000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.tenants
      ADD COLUMN IF NOT EXISTS principal_admin_user_id UUID
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN public.tenants.principal_admin_user_id IS
        'Administrador principal del tenant (FK logica a <schema_name>.users.id). Designacion explicita y auditada — ADR-063. NULL mientras el tenant no tenga ADMIN activo.'
    `);

    // Backfill con la regla derivada anterior, schema por schema.
    await queryRunner.query(`
      DO $$
      DECLARE
        tenant_row RECORD;
        principal_id uuid;
      BEGIN
        FOR tenant_row IN
          SELECT id, schema_name
            FROM public.tenants
           WHERE schema_name IS NOT NULL
        LOOP
          IF NOT EXISTS (
            SELECT 1
              FROM information_schema.tables
             WHERE table_schema = tenant_row.schema_name
               AND table_name = 'users'
          ) THEN
            CONTINUE;
          END IF;

          EXECUTE format(
            'SELECT id FROM %I.users
              WHERE role = ''ADMIN'' AND deleted_at IS NULL
              ORDER BY created_at ASC
              LIMIT 1',
            tenant_row.schema_name
          ) INTO principal_id;

          IF principal_id IS NOT NULL THEN
            UPDATE public.tenants
               SET principal_admin_user_id = principal_id
             WHERE id = tenant_row.id;
          END IF;
        END LOOP;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.tenants DROP COLUMN IF EXISTS principal_admin_user_id
    `);
  }
}
