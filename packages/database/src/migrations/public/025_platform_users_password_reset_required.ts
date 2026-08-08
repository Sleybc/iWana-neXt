import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 025 (MOD01 / primer ingreso): marca de cambio de contraseña
 * obligatorio para los usuarios de la consola de plataforma.
 *
 * ### Qué añade
 *
 * `public.platform_users.password_reset_required`, contraparte de la columna
 * homónima que los usuarios de tenant ya tienen en `<schema>.users`. El nombre
 * no es nuevo a propósito: la semántica es idéntica —«esta cuenta arrastra una
 * credencial de arranque y no puede operar hasta cambiarla»— y el claim JWT
 * `passwordResetRequired`, la consola de plataforma y el flujo de tenant ya
 * hablan ese vocabulario. Un segundo nombre para el mismo concepto obligaría a
 * mantener dos caminos que deben comportarse igual.
 *
 * ### Por qué NO se reutiliza `status`
 *
 * `UserStatus.PENDING_VERIFICATION` significa «pendiente de verificar el email
 * por token» y `AuthService.verifyEmail()` lo promueve a `ACTIVE`. Colgar de él
 * la obligación de cambiar la contraseña haría que verificar el correo —una
 * acción no relacionada— cancelase la obligación. Campo propio, entonces.
 *
 * ### Por qué `DEFAULT false`
 *
 * Los usuarios de plataforma ya existentes eligieron su contraseña; entrar con
 * `true` los dejaría a todos bloqueados tras un simple despliegue. La marca la
 * activa quien crea la credencial de arranque, no la migración.
 *
 * Reversible: `down()` elimina la columna.
 */
export class PlatformUsersPasswordResetRequired1784419213000 implements MigrationInterface {
  name = 'PlatformUsersPasswordResetRequired1784419213000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.platform_users
      ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN public.platform_users.password_reset_required IS
        'true mientras la cuenta arrastre la credencial de arranque: el login emite un token de alcance limitado que solo permite cambiar la contrasena.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.platform_users
      DROP COLUMN IF EXISTS password_reset_required
    `);
  }
}
