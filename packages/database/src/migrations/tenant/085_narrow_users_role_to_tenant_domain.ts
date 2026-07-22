import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 085 — ADR-061 §4: estrecha el dominio de `users.role` al de tenant.
 *
 * `SYSTEM_ADMIN` e `IWANA_SUPPORT` salen de `UserRole` y quedan solo en
 * `PlatformRole`. Hasta ahora la contención era perimetral (allowlist
 * `TENANT_ASSIGNABLE_ROLES` en el CRUD): la columna seguía admitiendo esos
 * valores, así que cualquier escritura que no pasara por `UsersService` podía
 * reintroducir el estado inválido que originó H-01. Este CHECK cierra esa vía.
 *
 * VERIFICACIÓN PREVIA OBLIGATORIA (condición del CTO al aprobar el ADR):
 * si el schema tiene filas con un rol de plataforma, la migración **aborta** en
 * vez de limpiarlas o degradar el aviso. Estrechar el dominio sobre datos sucios
 * dejaría a esos usuarios sin poder iniciar sesión, sin aviso previo. El runner
 * (`runTenantMigrations`) propaga el fallo y detiene la migración del resto de
 * schemas, de modo que la comprobación es efectivamente «en todos los schemas».
 * La verificación incluye filas con soft-delete: un CHECK aplica a la fila,
 * exista o no `deleted_at`.
 *
 * Resolución del aborto: reasignar esos usuarios a un rol de tenant válido, o
 * darlos de alta como `platform_users` si su función es realmente de plataforma.
 * No hay backfill automático — decidir por ellos es exactamente lo que el ADR
 * prohíbe.
 *
 * ACOPLAMIENTO CONOCIDO: el CHECK enumera los valores de `UserRole` en positivo.
 * Añadir un rol de tenant nuevo exige una migración que lo incluya; es el precio
 * de que el dominio esté declarado en la base y no solo en TypeScript.
 *
 * Reversible: `down()` retira el CHECK y devuelve la columna a su dominio
 * anterior (VARCHAR sin restricción). No reintroduce datos: no borró ninguno.
 */

/** Dominio de `UserRole` tras ADR-061 §4. Debe seguir a `user-role.enum.ts`. */
const TENANT_ROLE_DOMAIN = [
  'ADMIN',
  'NOC',
  'SUPPORT',
  'SALES',
  'TECHNICIAN',
  'ACCOUNTANT',
  'HR',
  'SUBSCRIBER',
  'CONTRACTOR',
  'PARTNER',
  'AUDITOR',
  'INVESTOR',
] as const;

const CONSTRAINT_NAME = 'chk_users_role_tenant_domain';

export class NarrowUsersRoleToTenantDomain0850000000000 implements MigrationInterface {
  name = 'NarrowUsersRoleToTenantDomain0850000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const domainSql = TENANT_ROLE_DOMAIN.map((role) => `'${role}'`).join(', ');

    // 1) Verificación previa: abortar si hay roles de plataforma persistidos.
    await queryRunner.query(`
      DO $$
      DECLARE
        dirty_count bigint;
      BEGIN
        SELECT COUNT(*) INTO dirty_count
          FROM users
         WHERE role NOT IN (${domainSql});

        IF dirty_count > 0 THEN
          RAISE EXCEPTION
            '085: % fila(s) de users con rol fuera del dominio de tenant en schema % — reasigne su rol o migrelos a platform_users antes de estrechar la columna (ADR-061 §4)',
            dirty_count, current_schema();
        END IF;
      END
      $$;
    `);

    // 2) Estrechamiento del dominio. Idempotente: no falla si ya existe.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = '${CONSTRAINT_NAME}'
             AND conrelid = 'users'::regclass
        ) THEN
          ALTER TABLE users
            ADD CONSTRAINT ${CONSTRAINT_NAME}
            CHECK (role IN (${domainSql}));
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN users.role IS
        'Rol de tenant (UserRole). Los roles de plataforma viven en platform_users.role (PlatformRole) — ADR-061 §4.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = '${CONSTRAINT_NAME}'
             AND conrelid = 'users'::regclass
        ) THEN
          ALTER TABLE users DROP CONSTRAINT ${CONSTRAINT_NAME};
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`COMMENT ON COLUMN users.role IS NULL`);
  }
}
