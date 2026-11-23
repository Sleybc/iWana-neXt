import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 037 — roles de plataforma autorizados a ver «Uso por empresa»
 * (ADR-114 v1.3 §9, CTO 2026-11-23).
 *
 * Se guarda en la fila única de configuración de plataforma (`platform_branding_settings`,
 * id `platform`) en lugar de crear otra tabla. Por defecto vacío: solo el administrador de
 * plataforma, que lo ve siempre y no figura en la lista. El CHECK acota la lista a los roles
 * autorizables (hoy solo `IWANA_SUPPORT`).
 *
 * Schema: public
 * Reversible: sí (el `down` descarta las concesiones; el comportamiento vuelve al de v1.2).
 */
export class TenantUsageViewerRoles1784419225000 implements MigrationInterface {
  name = 'TenantUsageViewerRoles1784419225000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "public"."platform_branding_settings"
         ADD COLUMN "tenant_usage_viewer_roles" text[] NOT NULL DEFAULT '{}'::text[],
         ADD CONSTRAINT "chk_pbs_tenant_usage_viewer_roles"
           CHECK ("tenant_usage_viewer_roles" <@ ARRAY['IWANA_SUPPORT']::text[])`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "public"."platform_branding_settings"
         DROP CONSTRAINT "chk_pbs_tenant_usage_viewer_roles",
         DROP COLUMN "tenant_usage_viewer_roles"`,
    );
  }
}
