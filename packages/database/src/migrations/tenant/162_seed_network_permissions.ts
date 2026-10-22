import { AccessPermissionKey } from '@iwana/shared';
import { MigrationInterface, QueryRunner } from 'typeorm';

const NETWORK_PERMISSION_SEEDS = [
  {
    key: AccessPermissionKey.NETWORK_CATALOG_READ,
    action: 'read',
    description: 'Consultar routers y redes IPv4',
  },
  {
    key: AccessPermissionKey.NETWORK_CATALOG_MANAGE,
    action: 'manage',
    description: 'Administrar routers, redes IPv4 y perfiles de plan',
  },
  {
    key: AccessPermissionKey.NETWORK_PROVISIONING_READ,
    action: 'read',
    description: 'Consultar servicios y eventos de aprovisionamiento',
  },
  {
    key: AccessPermissionKey.NETWORK_PROVISIONING_EXECUTE,
    action: 'execute',
    description: 'Reservar y ejecutar el aprovisionamiento de red',
  },
  {
    key: AccessPermissionKey.NETWORK_PROVISIONING_CERTIFY,
    action: 'certify',
    description: 'Certificar el aprovisionamiento con evidencia',
  },
  {
    key: AccessPermissionKey.NETWORK_PROVISIONING_REGULARIZE,
    action: 'regularize',
    description: 'Regularizar órdenes de instalación cerradas sin certificación',
  },
] as const;

const ADMIN_AND_PROVISIONING_KEYS = NETWORK_PERMISSION_SEEDS.map(({ key }) => `('${key}')`).join(
  ',\n',
);
const NOC_AND_PROVISIONING_KEYS = NETWORK_PERMISSION_SEEDS.map(({ key }) => `('${key}')`).join(
  ',\n',
);
const CATALOG_VALUES = NETWORK_PERMISSION_SEEDS.map(
  ({ key, action, description }) =>
    `(canonical_tenant_id, '${key}', 'network', '${action}', '${description}', 'MOD13_NETWORK_V1', 'ASSIGNABLE', true, true)`,
).join(',\n');

/** Migración tenant 162: siembra permisos y plantilla de acceso estándar para aprovisionamiento de red. */
export class SeedNetworkPermissions1620000000000 implements MigrationInterface {
  name = 'SeedNetworkPermissions1620000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $migration$
      DECLARE
        tenant_schema TEXT := current_schema();
        canonical_tenant_id UUID;
        tenant_count INTEGER;
        admin_profile_id UUID;
        noc_profile_id UUID;
        provisioning_profile_id UUID;
      BEGIN
        IF tenant_schema IS NULL OR tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$' THEN
          RAISE EXCEPTION 'La migración 162 solo puede ejecutarse sobre un schema tenant válido';
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
          ${CATALOG_VALUES}
        ON CONFLICT (tenant_id, permission_key) DO UPDATE
          SET module_key = EXCLUDED.module_key,
              action = EXCLUDED.action,
              description = EXCLUDED.description,
              catalog_version = EXCLUDED.catalog_version,
              availability = EXCLUDED.availability,
              is_system = true,
              is_active = true;

        INSERT INTO access_profiles
          (id, tenant_id, name, description, base_role_constraint, scope_site_id, is_system, is_active)
        VALUES
          (md5(concat_ws(chr(31), 'iwana', 'migration-162', canonical_tenant_id::text, 'profile', 'NETWORK_PROVISIONING'))::uuid,
           canonical_tenant_id, 'Acceso estándar Aprovisionamiento',
           'Plantilla estándar para operación de aprovisionamiento de red (MOD13_NETWORK_V1).',
           'NOC', NULL, true, true)
        ON CONFLICT (tenant_id, name) WHERE deleted_at IS NULL DO UPDATE
          SET description = EXCLUDED.description,
              base_role_constraint = EXCLUDED.base_role_constraint,
              scope_site_id = NULL,
              is_system = true,
              is_active = true;

        SELECT id INTO admin_profile_id FROM access_profiles
        WHERE tenant_id = canonical_tenant_id AND name = 'Administrador general'
          AND base_role_constraint = 'ADMIN' AND is_system = true AND is_active = true AND deleted_at IS NULL;
        SELECT id INTO noc_profile_id FROM access_profiles
        WHERE tenant_id = canonical_tenant_id AND name = 'Acceso estándar NOC'
          AND base_role_constraint = 'NOC' AND is_system = true AND is_active = true AND deleted_at IS NULL;
        SELECT id INTO provisioning_profile_id FROM access_profiles
        WHERE tenant_id = canonical_tenant_id AND name = 'Acceso estándar Aprovisionamiento'
          AND base_role_constraint = 'NOC' AND is_system = true AND is_active = true AND deleted_at IS NULL;

        IF admin_profile_id IS NULL OR noc_profile_id IS NULL OR provisioning_profile_id IS NULL THEN
          RAISE EXCEPTION 'No se encontraron las plantillas estándar ADMIN y NOC requeridas por MOD13';
        END IF;

        INSERT INTO access_profile_permissions (tenant_id, profile_id, permission_key)
        SELECT canonical_tenant_id, admin_profile_id, permission_key
        FROM (VALUES ${ADMIN_AND_PROVISIONING_KEYS}) AS permissions(permission_key)
        ON CONFLICT (tenant_id, profile_id, permission_key) DO NOTHING;

        INSERT INTO access_profile_permissions (tenant_id, profile_id, permission_key)
        SELECT canonical_tenant_id, noc_profile_id, permission_key
        FROM (VALUES ${NOC_AND_PROVISIONING_KEYS}) AS permissions(permission_key)
        ON CONFLICT (tenant_id, profile_id, permission_key) DO NOTHING;

        INSERT INTO access_profile_permissions (tenant_id, profile_id, permission_key)
        SELECT canonical_tenant_id, provisioning_profile_id, permission_key
        FROM (VALUES ${NOC_AND_PROVISIONING_KEYS}) AS permissions(permission_key)
        ON CONFLICT (tenant_id, profile_id, permission_key) DO NOTHING;

        INSERT INTO network_settings (tenant_id, enforce_provisioning_on_install_close)
        VALUES (canonical_tenant_id, false)
        ON CONFLICT (tenant_id) DO NOTHING;
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
          AND permission_key IN (
            '${AccessPermissionKey.NETWORK_CATALOG_READ}',
            '${AccessPermissionKey.NETWORK_CATALOG_MANAGE}',
            '${AccessPermissionKey.NETWORK_PROVISIONING_READ}',
            '${AccessPermissionKey.NETWORK_PROVISIONING_EXECUTE}',
            '${AccessPermissionKey.NETWORK_PROVISIONING_CERTIFY}',
            '${AccessPermissionKey.NETWORK_PROVISIONING_REGULARIZE}'
          )
          AND profile_id IN (
            SELECT id FROM access_profiles
            WHERE tenant_id = canonical_tenant_id
              AND name IN ('Administrador general', 'Acceso estándar NOC', 'Acceso estándar Aprovisionamiento')
          );

        UPDATE access_profiles
        SET is_active = false
        WHERE tenant_id = canonical_tenant_id
          AND name = 'Acceso estándar Aprovisionamiento'
          AND base_role_constraint = 'NOC'
          AND is_system = true;

        DELETE FROM access_permission_catalog
        WHERE tenant_id = canonical_tenant_id
          AND permission_key IN (
            '${AccessPermissionKey.NETWORK_CATALOG_READ}',
            '${AccessPermissionKey.NETWORK_CATALOG_MANAGE}',
            '${AccessPermissionKey.NETWORK_PROVISIONING_READ}',
            '${AccessPermissionKey.NETWORK_PROVISIONING_EXECUTE}',
            '${AccessPermissionKey.NETWORK_PROVISIONING_CERTIFY}',
            '${AccessPermissionKey.NETWORK_PROVISIONING_REGULARIZE}'
          )
          AND catalog_version = 'MOD13_NETWORK_V1';

        DELETE FROM network_settings
        WHERE tenant_id = canonical_tenant_id
          AND enforce_provisioning_on_install_close = false
          AND updated_by IS NULL;
      END
      $rollback$
    `);
  }
}
