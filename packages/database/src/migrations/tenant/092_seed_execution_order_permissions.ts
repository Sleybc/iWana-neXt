import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración: Siembra los 6 permisos canónicos de órdenes de ejecución y el
 * alias deprecado wfm.work_orders.execute en el catálogo de acceso por tenant.
 *
 * Schema: tenant (search_path)
 * Reversible: sí — el down es deliberadamente no destructivo: el catálogo es
 * también mantenido por el seeder runtime de MOD00 y no tiene una marca de
 * procedencia que permita distinguir sus filas de las creadas aquí.
 *
 * Condición de retiro del alias:
 *   "retirable cuando cero consumidores y Task 10 complete"
 *   (INFORME-MOD11-FLOW-CABLEADO-v1.0.md §9.3)
 */

export class SeedExecutionOrderPermissions0920000000000 implements MigrationInterface {
  name = 'SeedExecutionOrderPermissions0920000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // MOD00_ACCESS_V1_CATALOG vive en apps/api, que no es una dependencia válida
    // de @iwana/db. Por boundary, esta migración es la única fuente ejecutable
    // del seed SQL y sus valores se mantienen comparables 1:1 con ese catálogo;
    // no se importa código de apps/api desde una migración.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS execution_order_permission_seed_092 (
        permission_key      VARCHAR(120) NOT NULL,
        tenant_id           UUID        NOT NULL,
        catalog_entry_id    UUID        NOT NULL,
        seeded_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_execution_order_permission_seed_092 PRIMARY KEY (permission_key)
      )
    `);
    await queryRunner.query(`
      /* Source contract: MOD00_ACCESS_V1_CATALOG (apps/api boundary). */
      DO $migration$
      DECLARE
        canonical_tenant_id UUID;
        tenant_count INTEGER;
        inserted_count INTEGER := 0;
        catalog_count INTEGER;
        inserted_row RECORD;
      BEGIN
        SELECT id INTO canonical_tenant_id
        FROM public.tenants
        WHERE schema_name = current_schema();

        FOR inserted_row IN
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
            ('operations.execution_orders.read', 'operations', 'read', 'Consultar órdenes de ejecución asignadas y supervisadas', 'MOD00_ACCESS_V1', 'ASSIGNABLE', true, true),
            ('operations.execution_orders.execute', 'operations', 'execute', 'Ejecutar actividades, evidencias y cierre de órdenes asignadas', 'MOD00_ACCESS_V1', 'ASSIGNABLE', true, true),
            ('operations.execution_orders.supervise', 'operations', 'supervise', 'Asignar y supervisar órdenes de ejecución', 'MOD00_ACCESS_V1', 'ASSIGNABLE', true, true),
            ('operations.execution_order_templates.read', 'operations', 'read', 'Consultar plantillas de ejecución', 'MOD00_ACCESS_V1', 'ASSIGNABLE', true, true),
            ('operations.execution_order_templates.manage', 'operations', 'manage', 'Administrar versiones de plantillas de ejecución', 'MOD00_ACCESS_V1', 'ASSIGNABLE', true, true),
            ('operations.execution_events.redrive', 'operations', 'redrive', 'Reintentar eventos fallidos de ejecución con ticket operativo', 'MOD00_ACCESS_V1', 'ASSIGNABLE', true, true),
            ('wfm.work_orders.execute', 'wfm', 'execute', 'Ejecutar órdenes de trabajo asignadas', 'MOD00_ACCESS_V1', 'ASSIGNABLE', true, true)
          ) AS seeds(permission_key, module_key, action, description, catalog_version, availability, is_system, is_active)
          WHERE tenants.schema_name = current_schema()
          ON CONFLICT (tenant_id, permission_key) DO NOTHING
          RETURNING id, permission_key, tenant_id
        LOOP
          inserted_count := inserted_count + 1;
          INSERT INTO execution_order_permission_seed_092
            (permission_key, tenant_id, catalog_entry_id)
          VALUES (inserted_row.permission_key, inserted_row.tenant_id, inserted_row.id)
          ON CONFLICT (permission_key) DO NOTHING;
        END LOOP;

        SELECT COUNT(*) INTO tenant_count
        FROM public.tenants
        WHERE schema_name = current_schema();
        IF tenant_count = 0 THEN
          RAISE EXCEPTION 'No canonical tenant found for schema %', current_schema();
        END IF;

        SELECT COUNT(*) INTO catalog_count
        FROM access_permission_catalog
        WHERE tenant_id = canonical_tenant_id
          AND is_system = true
          AND is_active = true
          AND catalog_version = 'MOD00_ACCESS_V1'
          AND availability = 'ASSIGNABLE'
          AND (
            (permission_key = 'operations.execution_orders.read' AND module_key = 'operations' AND action = 'read' AND description = 'Consultar órdenes de ejecución asignadas y supervisadas') OR
            (permission_key = 'operations.execution_orders.execute' AND module_key = 'operations' AND action = 'execute' AND description = 'Ejecutar actividades, evidencias y cierre de órdenes asignadas') OR
            (permission_key = 'operations.execution_orders.supervise' AND module_key = 'operations' AND action = 'supervise' AND description = 'Asignar y supervisar órdenes de ejecución') OR
            (permission_key = 'operations.execution_order_templates.read' AND module_key = 'operations' AND action = 'read' AND description = 'Consultar plantillas de ejecución') OR
            (permission_key = 'operations.execution_order_templates.manage' AND module_key = 'operations' AND action = 'manage' AND description = 'Administrar versiones de plantillas de ejecución') OR
            (permission_key = 'operations.execution_events.redrive' AND module_key = 'operations' AND action = 'redrive' AND description = 'Reintentar eventos fallidos de ejecución con ticket operativo') OR
            (permission_key = 'wfm.work_orders.execute' AND module_key = 'wfm' AND action = 'execute' AND description = 'Ejecutar órdenes de trabajo asignadas')
          );
        IF catalog_count <> 7 THEN
          RAISE EXCEPTION
            'Execution-order permission catalog is incomplete or divergent (% of 7; inserted % rows)',
            catalog_count, inserted_count;
        END IF;
      END
      $migration$
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $rollback$
      DECLARE
        seeded_row RECORD;
        deleted_id UUID;
      BEGIN
        FOR seeded_row IN
          SELECT permission_key, tenant_id, catalog_entry_id
          FROM execution_order_permission_seed_092
        LOOP
          deleted_id := NULL;
          DELETE FROM access_permission_catalog AS catalog
          WHERE catalog.id = seeded_row.catalog_entry_id
            AND catalog.tenant_id = seeded_row.tenant_id
            AND catalog.is_system = true
            AND catalog.is_active = true
            AND catalog.catalog_version = 'MOD00_ACCESS_V1'
            AND catalog.availability = 'ASSIGNABLE'
            AND (
              (catalog.permission_key = 'operations.execution_orders.read' AND catalog.module_key = 'operations' AND catalog.action = 'read' AND catalog.description = 'Consultar órdenes de ejecución asignadas y supervisadas') OR
              (catalog.permission_key = 'operations.execution_orders.execute' AND catalog.module_key = 'operations' AND catalog.action = 'execute' AND catalog.description = 'Ejecutar actividades, evidencias y cierre de órdenes asignadas') OR
              (catalog.permission_key = 'operations.execution_orders.supervise' AND catalog.module_key = 'operations' AND catalog.action = 'supervise' AND catalog.description = 'Asignar y supervisar órdenes de ejecución') OR
              (catalog.permission_key = 'operations.execution_order_templates.read' AND catalog.module_key = 'operations' AND catalog.action = 'read' AND catalog.description = 'Consultar plantillas de ejecución') OR
              (catalog.permission_key = 'operations.execution_order_templates.manage' AND catalog.module_key = 'operations' AND catalog.action = 'manage' AND catalog.description = 'Administrar versiones de plantillas de ejecución') OR
              (catalog.permission_key = 'operations.execution_events.redrive' AND catalog.module_key = 'operations' AND catalog.action = 'redrive' AND catalog.description = 'Reintentar eventos fallidos de ejecución con ticket operativo') OR
              (catalog.permission_key = 'wfm.work_orders.execute' AND catalog.module_key = 'wfm' AND catalog.action = 'execute' AND catalog.description = 'Ejecutar órdenes de trabajo asignadas')
            )
          RETURNING catalog.id INTO deleted_id;
          IF deleted_id IS NULL THEN
            RAISE EXCEPTION 'Rollback blocked: seeded permission % was changed or removed', seeded_row.permission_key;
          END IF;
          DELETE FROM execution_order_permission_seed_092
          WHERE permission_key = seeded_row.permission_key;
        END LOOP;
      END
      $rollback$
    `);
    await queryRunner.query(`DROP TABLE execution_order_permission_seed_092`);
  }
}
