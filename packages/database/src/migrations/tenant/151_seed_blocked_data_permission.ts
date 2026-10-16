import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 151 — permiso de lectura de datos bloqueados para facturación y cobro.
 * El perfil queda disponible para asignación administrativa y no se asigna a usuarios.
 */
export class SeedBlockedDataPermission1510000000000 implements MigrationInterface {
  name = 'SeedBlockedDataPermission1510000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $migration$
      DECLARE
        tenant_schema TEXT := current_schema();
        canonical_tenant_id UUID;
        tenant_count INTEGER;
        billing_profile_id UUID;
      BEGIN
        IF tenant_schema IS NULL OR tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$' THEN
          RAISE EXCEPTION 'La migración 151 solo puede ejecutarse sobre un schema tenant válido';
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
          (canonical_tenant_id, 'crm.blocked_data.read', 'crm', 'blocked_data.read',
           'Consultar datos bloqueados para facturación y cobro',
           'ADR-094_PRIVACY_V1B', 'ASSIGNABLE', true, true)
        ON CONFLICT (tenant_id, permission_key) DO UPDATE
          SET module_key = EXCLUDED.module_key,
              action = EXCLUDED.action,
              description = EXCLUDED.description,
              catalog_version = EXCLUDED.catalog_version,
              availability = EXCLUDED.availability,
              is_system = true,
              is_active = true;

        billing_profile_id := md5(concat_ws(chr(31), 'iwana', 'migration-151',
          canonical_tenant_id::text, 'profile', 'CRM_BLOCKED_DATA_READ'))::uuid;
        INSERT INTO access_profiles
          (id, tenant_id, name, description, base_role_constraint, scope_site_id, is_system, is_active)
        VALUES
          (billing_profile_id, canonical_tenant_id, 'Facturación y cobro',
           'Plantilla de lectura de datos bloqueados para facturación y cobro (ADR-094).',
           'ACCOUNTANT', NULL, true, true)
        ON CONFLICT (tenant_id, name) WHERE deleted_at IS NULL DO UPDATE
          SET description = EXCLUDED.description,
              base_role_constraint = EXCLUDED.base_role_constraint,
              scope_site_id = NULL,
              is_system = true,
              is_active = true;

        SELECT id INTO billing_profile_id
        FROM access_profiles
        WHERE tenant_id = canonical_tenant_id
          AND name = 'Facturación y cobro'
          AND deleted_at IS NULL;

        DELETE FROM access_profile_permissions
        WHERE tenant_id = canonical_tenant_id
          AND profile_id = billing_profile_id;

        INSERT INTO access_profile_permissions (tenant_id, profile_id, permission_key)
        VALUES (canonical_tenant_id, billing_profile_id, 'crm.blocked_data.read');
      END
      $migration$
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
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
          AND profile_id IN (
            SELECT id FROM access_profiles
            WHERE tenant_id = canonical_tenant_id
              AND name = 'Facturación y cobro'
          )
          AND permission_key = 'crm.blocked_data.read';

        UPDATE access_profiles
        SET is_active = false
        WHERE tenant_id = canonical_tenant_id
          AND name = 'Facturación y cobro'
          AND is_system = true;

        DELETE FROM access_permission_catalog
        WHERE tenant_id = canonical_tenant_id
          AND permission_key = 'crm.blocked_data.read'
          AND catalog_version = 'ADR-094_PRIVACY_V1B';
      END
      $rollback$
    `);
  }
}
