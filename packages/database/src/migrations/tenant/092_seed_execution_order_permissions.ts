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
    // Valores consolidados con MOD00_ACCESS_V1_CATALOG. El tenant canónico es
    // public.tenants.id, localizado por el schema que el runner ya activó.
    await queryRunner.query(`
      DO $migration$
      DECLARE
        tenant_count INTEGER;
      BEGIN
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
        ON CONFLICT (tenant_id, permission_key) DO NOTHING;

        SELECT COUNT(*) INTO tenant_count
        FROM public.tenants
        WHERE schema_name = current_schema();
        IF tenant_count = 0 THEN
          RAISE EXCEPTION 'No canonical tenant found for schema %', current_schema();
        END IF;
      END
      $migration$
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // No borrar: estas mismas filas pueden haber sido creadas o reconciliadas
    // por el seeder runtime de MOD00. Sin una columna de procedencia, un DELETE
    // no puede distinguirlas de las filas de esta migración.
    await queryRunner.query('SELECT 1');
  }
}
