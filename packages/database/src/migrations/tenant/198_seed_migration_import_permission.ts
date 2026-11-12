import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración tenant 198 — permiso `migration.import.manage` (ADR-110 D9): subir, simular,
 * promover, conciliar y revertir importaciones. Se concede por defecto solo a la plantilla
 * estándar de Administración; cada perfil puede recibirlo o retirarlo como cualquier otro.
 *
 * La clave es nueva: down retira el catálogo y toda asignación de esa clave, que no podía
 * existir antes de up.
 */
export class SeedMigrationImportPermission1980000000198 implements MigrationInterface {
  name = 'SeedMigrationImportPermission1980000000198';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $migration$
      DECLARE
        tenant_schema TEXT := current_schema();
        canonical_tenant_id UUID;
        tenant_count INTEGER;
      BEGIN
        IF tenant_schema IS NULL OR tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$' THEN
          RAISE EXCEPTION 'La migración 198 solo puede ejecutarse sobre un schema tenant válido';
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
          (canonical_tenant_id, 'migration.import.manage', 'migration', 'import.manage',
           'Importar clientes desde otro sistema: simular, promover, conciliar y revertir',
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
        SELECT canonical_tenant_id, profile.id, 'migration.import.manage'
        FROM access_profiles profile
        WHERE profile.tenant_id = canonical_tenant_id
          AND profile.is_system = true
          AND profile.deleted_at IS NULL
          AND profile.name = 'Administrador general'
          AND profile.base_role_constraint = 'ADMIN'
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
          AND permission_key = 'migration.import.manage';

        DELETE FROM access_permission_catalog
        WHERE tenant_id = canonical_tenant_id
          AND permission_key = 'migration.import.manage';
      END
      $rollback$
    `);
  }
}
