import { AccessPermissionKey } from '@iwana/shared';
import { MigrationInterface, QueryRunner } from 'typeorm';

const BILLING_PERMISSION_SEEDS = [
  {
    key: AccessPermissionKey.BILLING_INVOICES_READ,
    action: 'read',
    description: 'Consultar documentos y periodos de cobro',
  },
  {
    key: AccessPermissionKey.BILLING_INVOICES_MANAGE,
    action: 'manage',
    description: 'Generar, emitir y anular documentos de cobro',
  },
  {
    key: AccessPermissionKey.BILLING_PAYMENTS_READ,
    action: 'read',
    description: 'Consultar pagos y aplicaciones',
  },
  {
    key: AccessPermissionKey.BILLING_PAYMENTS_REGISTER,
    action: 'register',
    description: 'Registrar, aplicar y anular pagos',
  },
  {
    key: AccessPermissionKey.BILLING_POLICY_MANAGE,
    action: 'manage',
    description: 'Configurar la política de facturación del tenant y contratos',
  },
] as const;

const ADMIN_KEYS = BILLING_PERMISSION_SEEDS.map(({ key }) => `('${key}')`).join(',\n');

const ACCOUNTANT_KEYS = [
  AccessPermissionKey.BILLING_INVOICES_READ,
  AccessPermissionKey.BILLING_INVOICES_MANAGE,
  AccessPermissionKey.BILLING_PAYMENTS_READ,
  AccessPermissionKey.BILLING_PAYMENTS_REGISTER,
]
  .map((key) => `('${key}')`)
  .join(',\n');

const READ_ONLY_KEYS = [
  AccessPermissionKey.BILLING_INVOICES_READ,
  AccessPermissionKey.BILLING_PAYMENTS_READ,
]
  .map((key) => `('${key}')`)
  .join(',\n');

const CATALOG_VALUES = BILLING_PERMISSION_SEEDS.map(
  ({ key, action, description }) =>
    `(canonical_tenant_id, '${key}', 'billing', '${action}', '${description}', 'MOD14_BILLING_V1', 'ASSIGNABLE', true, true)`,
).join(',\n');

const BILLING_PERMISSION_KEYS_SQL = BILLING_PERMISSION_SEEDS.map(({ key }) => `'${key}'`).join(
  ', ',
);

/**
 * Migración tenant 174: siembra permisos y asignaciones estándar de MOD14 Facturación (HLD §3.2, §7).
 */
export class SeedBillingPermissions1740000000174 implements MigrationInterface {
  name = 'SeedBillingPermissions1740000000174';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Conserva el estado previo de las claves RESERVED para que down sea reversible.
    // Las tablas viven en el schema tenant y solo guardan filas de este catálogo cerrado.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS billing_permission_catalog_backup_174 (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        permission_key varchar(120) NOT NULL,
        module_key varchar(60) NOT NULL,
        action varchar(60) NOT NULL,
        description varchar(240) NOT NULL,
        catalog_version varchar(40) NOT NULL,
        availability varchar(20) NOT NULL,
        is_system boolean NOT NULL,
        is_active boolean NOT NULL
      );
      CREATE TABLE IF NOT EXISTS billing_profile_permissions_backup_174 (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        profile_id uuid NOT NULL,
        permission_key varchar(120) NOT NULL
      );
      CREATE TABLE IF NOT EXISTS billing_permission_snapshot_174 (
        tenant_id uuid PRIMARY KEY
      );
    `);

    await queryRunner.query(`
      DO $migration$
      DECLARE
        tenant_schema TEXT := current_schema();
        canonical_tenant_id UUID;
        snapshot_tenant_id UUID;
        tenant_count INTEGER;
        admin_profile_id UUID;
        accountant_profile_id UUID;
        support_profile_id UUID;
        sales_profile_id UUID;
        auditor_profile_id UUID;
      BEGIN
        IF tenant_schema IS NULL OR tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$' THEN
          RAISE EXCEPTION 'La migración 174 solo puede ejecutarse sobre un schema tenant válido';
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

        -- Toma el snapshot solo en la primera ejecución, antes de modificar el catálogo.
        INSERT INTO billing_permission_snapshot_174 (tenant_id)
        VALUES (canonical_tenant_id)
        ON CONFLICT (tenant_id) DO NOTHING
        RETURNING tenant_id INTO snapshot_tenant_id;
        IF snapshot_tenant_id IS NOT NULL THEN
          INSERT INTO billing_permission_catalog_backup_174
            (id, tenant_id, permission_key, module_key, action, description, catalog_version,
             availability, is_system, is_active)
          SELECT id, tenant_id, permission_key, module_key, action, description, catalog_version,
                 availability, is_system, is_active
          FROM access_permission_catalog
          WHERE tenant_id = canonical_tenant_id
            AND permission_key IN (${BILLING_PERMISSION_KEYS_SQL})
          ON CONFLICT (id) DO NOTHING;

          INSERT INTO billing_profile_permissions_backup_174
            (id, tenant_id, profile_id, permission_key)
          SELECT id, tenant_id, profile_id, permission_key
          FROM access_profile_permissions
          WHERE tenant_id = canonical_tenant_id
            AND permission_key IN (${BILLING_PERMISSION_KEYS_SQL})
          ON CONFLICT (id) DO NOTHING;
        END IF;

        -- 1. Upsert en el catálogo de permisos
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

        -- 2. Resolver perfiles estándar existentes
        SELECT id INTO admin_profile_id FROM access_profiles
        WHERE tenant_id = canonical_tenant_id AND name = 'Administrador general'
          AND is_system = true AND is_active = true AND deleted_at IS NULL;

        SELECT id INTO accountant_profile_id FROM access_profiles
        WHERE tenant_id = canonical_tenant_id AND name = 'Acceso estándar Contable'
          AND is_system = true AND is_active = true AND deleted_at IS NULL;

        SELECT id INTO support_profile_id FROM access_profiles
        WHERE tenant_id = canonical_tenant_id AND name = 'Acceso estándar Soporte'
          AND is_system = true AND is_active = true AND deleted_at IS NULL;

        SELECT id INTO sales_profile_id FROM access_profiles
        WHERE tenant_id = canonical_tenant_id AND name = 'Acceso estándar Comercial'
          AND is_system = true AND is_active = true AND deleted_at IS NULL;

        SELECT id INTO auditor_profile_id FROM access_profiles
        WHERE tenant_id = canonical_tenant_id AND name = 'Acceso estándar Auditoría'
          AND is_system = true AND is_active = true AND deleted_at IS NULL;

        -- 3. Asignación a Administrador general (todas las 5 claves)
        IF admin_profile_id IS NOT NULL THEN
          INSERT INTO access_profile_permissions (tenant_id, profile_id, permission_key)
          SELECT canonical_tenant_id, admin_profile_id, permission_key
          FROM (VALUES ${ADMIN_KEYS}) AS permissions(permission_key)
          ON CONFLICT (tenant_id, profile_id, permission_key) DO NOTHING;
        END IF;

        -- 4. Asignación a Acceso estándar Contable (4 claves: inmutables/manage/register)
        IF accountant_profile_id IS NOT NULL THEN
          INSERT INTO access_profile_permissions (tenant_id, profile_id, permission_key)
          SELECT canonical_tenant_id, accountant_profile_id, permission_key
          FROM (VALUES ${ACCOUNTANT_KEYS}) AS permissions(permission_key)
          ON CONFLICT (tenant_id, profile_id, permission_key) DO NOTHING;
        END IF;

        -- 5. Asignación a Acceso estándar Soporte (2 claves: solo lectura)
        IF support_profile_id IS NOT NULL THEN
          INSERT INTO access_profile_permissions (tenant_id, profile_id, permission_key)
          SELECT canonical_tenant_id, support_profile_id, permission_key
          FROM (VALUES ${READ_ONLY_KEYS}) AS permissions(permission_key)
          ON CONFLICT (tenant_id, profile_id, permission_key) DO NOTHING;
        END IF;

        -- 6. Asignación a Acceso estándar Comercial (2 claves: solo lectura)
        IF sales_profile_id IS NOT NULL THEN
          INSERT INTO access_profile_permissions (tenant_id, profile_id, permission_key)
          SELECT canonical_tenant_id, sales_profile_id, permission_key
          FROM (VALUES ${READ_ONLY_KEYS}) AS permissions(permission_key)
          ON CONFLICT (tenant_id, profile_id, permission_key) DO NOTHING;
        END IF;

        -- 7. Asignación a Acceso estándar Auditoría (2 claves: solo lectura)
        IF auditor_profile_id IS NOT NULL THEN
          INSERT INTO access_profile_permissions (tenant_id, profile_id, permission_key)
          SELECT canonical_tenant_id, auditor_profile_id, permission_key
          FROM (VALUES ${READ_ONLY_KEYS}) AS permissions(permission_key)
          ON CONFLICT (tenant_id, profile_id, permission_key) DO NOTHING;
        END IF;
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

        -- Restituir exactamente las asignaciones existentes antes de la migración.
        DELETE FROM access_profile_permissions
        WHERE tenant_id = canonical_tenant_id
          AND permission_key IN (${BILLING_PERMISSION_KEYS_SQL});
        INSERT INTO access_profile_permissions (id, tenant_id, profile_id, permission_key)
        SELECT id, tenant_id, profile_id, permission_key
        FROM billing_profile_permissions_backup_174
        WHERE tenant_id = canonical_tenant_id
        ON CONFLICT (tenant_id, profile_id, permission_key) DO NOTHING;

        -- Recuperar las filas RESERVED de MOD00 y retirar solo las claves nuevas.
        DELETE FROM access_permission_catalog
        WHERE tenant_id = canonical_tenant_id
          AND permission_key IN (${BILLING_PERMISSION_KEYS_SQL});
        INSERT INTO access_permission_catalog
          (id, tenant_id, permission_key, module_key, action, description, catalog_version,
           availability, is_system, is_active)
        SELECT id, tenant_id, permission_key, module_key, action, description, catalog_version,
               availability, is_system, is_active
        FROM billing_permission_catalog_backup_174
        WHERE tenant_id = canonical_tenant_id
        ON CONFLICT (tenant_id, permission_key) DO UPDATE
          SET id = EXCLUDED.id,
              module_key = EXCLUDED.module_key,
              action = EXCLUDED.action,
              description = EXCLUDED.description,
              catalog_version = EXCLUDED.catalog_version,
              availability = EXCLUDED.availability,
              is_system = EXCLUDED.is_system,
              is_active = EXCLUDED.is_active;
      END
      $rollback$
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS billing_profile_permissions_backup_174;
      DROP TABLE IF EXISTS billing_permission_catalog_backup_174;
      DROP TABLE IF EXISTS billing_permission_snapshot_174;
    `);
  }
}
