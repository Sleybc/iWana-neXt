import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 003 — Campos de empresa para tenants.
 *
 * Agrega columnas para datos legales, dirección y contacto en public.tenants.
 * Todos los campos son opcionales (nullable) — el provisioning inicial solo
 * requiere name, slug y contactEmail.
 *
 * Nota: country_code se nombra explícitamente distinto de "country" para
 * evitar colisión con el campo homónimo dentro del JSONB settings.
 */
export class AddTenantBusinessFields1742200000000 implements MigrationInterface {
  name = 'AddTenantBusinessFields1742200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Datos legales
    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
        ADD COLUMN IF NOT EXISTS "legal_name"       VARCHAR(300),
        ADD COLUMN IF NOT EXISTS "nit"              VARCHAR(20),
        ADD COLUMN IF NOT EXISTS "nit_dv"           CHAR(1),
        ADD COLUMN IF NOT EXISTS "company_type"     VARCHAR(20),
        ADD COLUMN IF NOT EXISTS "address"          VARCHAR(500),
        ADD COLUMN IF NOT EXISTS "city"             VARCHAR(100),
        ADD COLUMN IF NOT EXISTS "department"       VARCHAR(100),
        ADD COLUMN IF NOT EXISTS "country_code"     CHAR(2)      DEFAULT 'CO',
        ADD COLUMN IF NOT EXISTS "postal_code"      VARCHAR(10),
        ADD COLUMN IF NOT EXISTS "coordinates"      VARCHAR(50),
        ADD COLUMN IF NOT EXISTS "phone"            VARCHAR(20),
        ADD COLUMN IF NOT EXISTS "website"          VARCHAR(255),
        ADD COLUMN IF NOT EXISTS "economic_sector"  VARCHAR(10)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "public"."tenants"
        DROP COLUMN IF EXISTS "legal_name",
        DROP COLUMN IF EXISTS "nit",
        DROP COLUMN IF EXISTS "nit_dv",
        DROP COLUMN IF EXISTS "company_type",
        DROP COLUMN IF EXISTS "address",
        DROP COLUMN IF EXISTS "city",
        DROP COLUMN IF EXISTS "department",
        DROP COLUMN IF EXISTS "country_code",
        DROP COLUMN IF EXISTS "postal_code",
        DROP COLUMN IF EXISTS "coordinates",
        DROP COLUMN IF EXISTS "phone",
        DROP COLUMN IF EXISTS "website",
        DROP COLUMN IF EXISTS "economic_sector"
    `);
  }
}
