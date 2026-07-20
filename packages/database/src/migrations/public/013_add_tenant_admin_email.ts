import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * NO REVERTIR EL TIMESTAMP DE ESTA CLASE (renumerada 2026-07-19).
 *
 * Esta migracion nacio con el sufijo `1700000000013`, MENOR que el de las
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
 * Migración 013: `public.tenants.admin_email`.
 *
 * El seed del tenant creaba su ADMIN inicial con la constante `admin@iwana.co`
 * para **todas** las empresas. Además de impedir saber quién administra cada
 * una, obligaba a cambiar el email a mano tras cada alta.
 *
 * El email pasa a indicarse al crear la empresa y se persiste aquí por dos
 * razones: el reintento de provisioning debe poder reconstruir el payload del
 * job sin volver a pedírselo al operador, y saber quién administra cada tenant
 * es metadato legítimo del registro.
 *
 * Nullable a propósito: los tenants anteriores a este campo se sembraron con la
 * constante y no hay valor real que rellenar. Un `NOT NULL` con default los
 * marcaría con un email que no es el suyo, que es peor que no saberlo.
 */
export class AddTenantAdminEmail1784419202000 implements MigrationInterface {
  name = 'AddTenantAdminEmail1784419202000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.tenants
      ADD COLUMN IF NOT EXISTS admin_email VARCHAR(255)
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN public.tenants.admin_email IS
        'Email del ADMIN inicial indicado al crear la empresa. NULL en tenants anteriores al campo, sembrados con la constante admin@iwana.co.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.tenants DROP COLUMN IF EXISTS admin_email
    `);
  }
}
