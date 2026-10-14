import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 147 — permisos y plantilla «Oficial de protección de datos».
 * Sigue la convergencia RBAC de la migración 119 y opera en el schema tenant.
 */
export class SeedPrivacyPermissions1470000000000 implements MigrationInterface {
  name = 'SeedPrivacyPermissions1470000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $migration$
      DECLARE
        tenant_schema TEXT := current_schema();
        canonical_tenant_id UUID;
        tenant_count INTEGER;
        privacy_profile_id UUID;
      BEGIN
        IF tenant_schema IS NULL OR tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$' THEN
          RAISE EXCEPTION 'La migración 147 solo puede ejecutarse sobre un schema tenant válido';
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
          (canonical_tenant_id, 'privacy.read', 'privacy', 'read',
           'Consultar las autorizaciones, solicitudes y marcas de protección de datos',
           'ADR-094_PRIVACY_V1', 'ASSIGNABLE', true, true),
          (canonical_tenant_id, 'privacy.manage', 'privacy', 'manage',
           'Administrar las solicitudes y controles de protección de datos',
           'ADR-094_PRIVACY_V1', 'ASSIGNABLE', true, true)
        ON CONFLICT (tenant_id, permission_key) DO UPDATE
          SET module_key = EXCLUDED.module_key,
              action = EXCLUDED.action,
              description = EXCLUDED.description,
              catalog_version = EXCLUDED.catalog_version,
              availability = EXCLUDED.availability,
              is_system = true,
              is_active = true;

        privacy_profile_id := md5(concat_ws(chr(31), 'iwana', 'migration-147',
          canonical_tenant_id::text, 'profile', 'PRIVACY_OFFICER'))::uuid;
        INSERT INTO access_profiles
          (id, tenant_id, name, description, base_role_constraint, scope_site_id, is_system, is_active)
        VALUES
          (privacy_profile_id, canonical_tenant_id, 'Oficial de protección de datos',
           'Plantilla de acceso para la gestión de protección de datos personales (ADR-094).',
           'AUDITOR', NULL, true, true)
        ON CONFLICT (tenant_id, name) WHERE deleted_at IS NULL DO UPDATE
          SET description = EXCLUDED.description,
              base_role_constraint = EXCLUDED.base_role_constraint,
              scope_site_id = NULL,
              is_system = true,
              is_active = true;

        SELECT id INTO privacy_profile_id
        FROM access_profiles
        WHERE tenant_id = canonical_tenant_id
          AND name = 'Oficial de protección de datos'
          AND deleted_at IS NULL;

        DELETE FROM access_profile_permissions
        WHERE tenant_id = canonical_tenant_id
          AND profile_id = privacy_profile_id
          AND permission_key IN ('privacy.read', 'privacy.manage');

        INSERT INTO access_profile_permissions (tenant_id, profile_id, permission_key)
        VALUES
          (canonical_tenant_id, privacy_profile_id, 'privacy.read'),
          (canonical_tenant_id, privacy_profile_id, 'privacy.manage');
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
              AND name = 'Oficial de protección de datos'
          )
          AND permission_key IN ('privacy.read', 'privacy.manage');

        UPDATE access_profiles
        SET is_active = false
        WHERE tenant_id = canonical_tenant_id
          AND name = 'Oficial de protección de datos'
          AND is_system = true;

        DELETE FROM access_permission_catalog
        WHERE tenant_id = canonical_tenant_id
          AND permission_key IN ('privacy.read', 'privacy.manage')
          AND catalog_version = 'ADR-094_PRIVACY_V1';
      END
      $rollback$
    `);
  }
}
