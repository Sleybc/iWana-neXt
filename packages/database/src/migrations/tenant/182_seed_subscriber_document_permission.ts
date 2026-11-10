import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración tenant 182 — permiso `crm.subscribers.document.read` (ficha estilo UISP,
 * decisión del 2026-11-10). Sin él la API enmascara el número de documento del titular
 * y rechaza escribirlo. Se concede por defecto a las plantillas estándar de Administración,
 * Soporte, Comercial y Contable; cada perfil puede retirarlo como cualquier otro permiso.
 *
 * La clave es nueva: down retira el catálogo y toda asignación de esa clave, que no podía
 * existir antes de up.
 */
export class SeedSubscriberDocumentPermission1820000000182 implements MigrationInterface {
  name = 'SeedSubscriberDocumentPermission1820000000182';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $migration$
      DECLARE
        tenant_schema TEXT := current_schema();
        canonical_tenant_id UUID;
        tenant_count INTEGER;
      BEGIN
        IF tenant_schema IS NULL OR tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$' THEN
          RAISE EXCEPTION 'La migración 182 solo puede ejecutarse sobre un schema tenant válido';
        END IF;

        PERFORM set_config('search_path', quote_ident(tenant_schema), true);
        SELECT COUNT(*) INTO tenant_count
        FROM public.tenants
        WHERE schema_name = tenant_schema;
        IF tenant_count <> 1 THEN
          RAISE EXCEPTION 'Se esperaba exactamente un tenant canónico para el schema actual';
        END IF;
        SELECT id INTO canonical_tenant_id
        FROM public.tenants
        WHERE schema_name = tenant_schema;

        INSERT INTO access_permission_catalog
          (tenant_id, permission_key, module_key, action, description, catalog_version,
           availability, is_system, is_active)
        VALUES
          (canonical_tenant_id, 'crm.subscribers.document.read', 'crm', 'document.read',
           'Ver y registrar el número de documento completo del suscriptor',
           'MOD00_ACCESS_V2', 'ASSIGNABLE', true, true)
        ON CONFLICT (tenant_id, permission_key) DO UPDATE
          SET module_key = EXCLUDED.module_key,
              action = EXCLUDED.action,
              description = EXCLUDED.description,
              catalog_version = EXCLUDED.catalog_version,
              availability = EXCLUDED.availability,
              is_system = true,
              is_active = true;

        INSERT INTO access_profile_permissions (tenant_id, profile_id, permission_key)
        SELECT canonical_tenant_id, profile.id, 'crm.subscribers.document.read'
        FROM access_profiles profile
        WHERE profile.tenant_id = canonical_tenant_id
          AND profile.is_system = true
          AND profile.deleted_at IS NULL
          AND (profile.name, profile.base_role_constraint) IN (
            ('Administrador general', 'ADMIN'),
            ('Acceso estándar Soporte', 'SUPPORT'),
            ('Acceso estándar Comercial', 'SALES'),
            ('Acceso estándar Contable', 'ACCOUNTANT')
          )
        ON CONFLICT (tenant_id, profile_id, permission_key) DO NOTHING;
      END
      $migration$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $rollback$
      DECLARE
        tenant_schema TEXT := current_schema();
        canonical_tenant_id UUID;
      BEGIN
        SELECT id INTO canonical_tenant_id
        FROM public.tenants
        WHERE schema_name = tenant_schema;
        IF canonical_tenant_id IS NULL THEN
          RETURN;
        END IF;

        DELETE FROM access_profile_permissions
        WHERE tenant_id = canonical_tenant_id
          AND permission_key = 'crm.subscribers.document.read';

        DELETE FROM access_permission_catalog
        WHERE tenant_id = canonical_tenant_id
          AND permission_key = 'crm.subscribers.document.read';
      END
      $rollback$
    `);
  }
}
