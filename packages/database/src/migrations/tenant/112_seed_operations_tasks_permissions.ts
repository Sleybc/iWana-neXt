import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración: Siembra operations.tasks.read y operations.tasks.manage en el
 * catálogo de acceso por tenant (claves que TasksController ya exige).
 *
 * Schema: tenant (search_path)
 * Reversible: sí
 *
 * MOD00_ACCESS_V1_CATALOG vive en apps/api, que no es una dependencia válida
 * de @iwana/db. Esta migración es la única fuente ejecutable del seed SQL;
 * los valores se mantienen comparables 1:1 con ese catálogo. No se importa
 * código de apps/api.
 */
export class SeedOperationsTasksPermissions1120000000000 implements MigrationInterface {
  name = 'SeedOperationsTasksPermissions1120000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      /* Source contract: MOD00_ACCESS_V1_CATALOG (apps/api boundary). */
      DO $migration$
      DECLARE
        canonical_tenant_id UUID;
        tenant_count INTEGER;
        catalog_count INTEGER;
      BEGIN
        SELECT COUNT(*) INTO tenant_count
        FROM public.tenants
        WHERE schema_name = current_schema();
        IF tenant_count = 0 THEN
          RAISE EXCEPTION 'No canonical tenant found for schema %', current_schema();
        END IF;

        SELECT id INTO canonical_tenant_id
        FROM public.tenants
        WHERE schema_name = current_schema();

        INSERT INTO access_permission_catalog
        (tenant_id, permission_key, module_key, action, description, catalog_version, availability, is_system, is_active)
        SELECT
          tenants.id,
          seeds.permission_key,
          seeds.module_key,
          seeds.action,
          seeds.description,
          seeds.catalog_version,
          seeds.availability,
          seeds.is_system,
          seeds.is_active
        FROM public.tenants AS tenants
        CROSS JOIN (VALUES
          ('operations.tasks.read', 'operations', 'read', 'Ver tareas operativas de la empresa', 'MOD00_ACCESS_V1', 'ASSIGNABLE', true, true),
          ('operations.tasks.manage', 'operations', 'manage', 'Crear, asignar y actualizar tareas operativas', 'MOD00_ACCESS_V1', 'ASSIGNABLE', true, true)
        ) AS seeds(permission_key, module_key, action, description, catalog_version, availability, is_system, is_active)
        WHERE tenants.schema_name = current_schema()
        ON CONFLICT (tenant_id, permission_key) DO NOTHING;

        SELECT COUNT(*) INTO catalog_count
        FROM access_permission_catalog
        WHERE tenant_id = canonical_tenant_id
          AND is_system = true
          AND is_active = true
          AND catalog_version = 'MOD00_ACCESS_V1'
          AND availability = 'ASSIGNABLE'
          AND (
            (permission_key = 'operations.tasks.read' AND module_key = 'operations' AND action = 'read' AND description = 'Ver tareas operativas de la empresa') OR
            (permission_key = 'operations.tasks.manage' AND module_key = 'operations' AND action = 'manage' AND description = 'Crear, asignar y actualizar tareas operativas')
          );
        IF catalog_count <> 2 THEN
          RAISE EXCEPTION
            'Operations tasks permission catalog is incomplete or divergent (% of 2)',
            catalog_count;
        END IF;
      END
      $migration$
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM access_permission_catalog
      WHERE catalog_version = 'MOD00_ACCESS_V1'
        AND availability = 'ASSIGNABLE'
        AND is_system = true
        AND permission_key IN ('operations.tasks.read', 'operations.tasks.manage')
        AND tenant_id = (
          SELECT id FROM public.tenants WHERE schema_name = current_schema()
        )
    `);
  }
}
