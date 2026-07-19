import { MigrationInterface, QueryRunner } from 'typeorm';

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
export class AddTenantAdminEmail1700000000013 implements MigrationInterface {
  name = 'AddTenantAdminEmail1700000000013';

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
