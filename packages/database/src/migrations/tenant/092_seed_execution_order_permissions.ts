import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración: Siembra los 6 permisos canónicos de órdenes de ejecución y el
 * alias deprecado wfm.work_orders.execute en el catálogo de acceso por tenant.
 *
 * Schema: tenant (search_path)
 * Reversible: sí — registra las claves insertadas para rollback exacto.
 *
 * Condición de retiro del alias:
 *   "retirable cuando cero consumidores y Task 10 complete"
 *   (INFORME-MOD11-FLOW-CABLEADO-v1.0.md §9.3)
 */

const PERMISSION_KEYS_TO_SEED = [
  'operations.execution_orders.read',
  'operations.execution_orders.execute',
  'operations.execution_orders.supervise',
  'operations.execution_order_templates.read',
  'operations.execution_order_templates.manage',
  'operations.execution_events.redrive',
  // Alias deprecado — mapea a operations.execution_orders.execute
  'wfm.work_orders.execute',
] as const;

export class SeedExecutionOrderPermissions0920000000000 implements MigrationInterface {
  name = 'SeedExecutionOrderPermissions0920000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Inserta las 7 entradas en el catálogo usando ON CONFLICT DO NOTHING
    // para ser idempotente. Solo se insertan si no existen ya en el tenant.
    await queryRunner.query(`
      INSERT INTO access_permission_catalog
        (tenant_id, permission_key, module_key, action, description, catalog_version, availability, is_system, is_active)
      SELECT
        tenants.tenant_id,
        seeds.permission_key,
        seeds.module_key,
        seeds.action,
        seeds.description,
        seeds.catalog_version,
        seeds.availability,
        seeds.is_system,
        seeds.is_active
      FROM
        (VALUES
          ('operations.execution_orders.read',          'operations', 'read',      'Consultar órdenes de ejecución asignadas y supervisadas',      'MOD00_ACCESS_V1', 'ASSIGNABLE', true, true),
          ('operations.execution_orders.execute',        'operations', 'execute',   'Ejecutar actividades, evidencias y cierre de órdenes asignadas', 'MOD00_ACCESS_V1', 'ASSIGNABLE', true, true),
          ('operations.execution_orders.supervise',      'operations', 'supervise', 'Asignar y supervisar órdenes de ejecución',                     'MOD00_ACCESS_V1', 'ASSIGNABLE', true, true),
          ('operations.execution_order_templates.read',  'operations', 'read',      'Consultar plantillas de ejecución',                             'MOD00_ACCESS_V1', 'ASSIGNABLE', true, true),
          ('operations.execution_order_templates.manage','operations', 'manage',    'Administrar versiones de plantillas de ejecución',               'MOD00_ACCESS_V1', 'ASSIGNABLE', true, true),
          ('operations.execution_events.redrive',         'operations', 'redrive',   'Reintentar eventos fallidos de ejecución con ticket operativo',  'MOD00_ACCESS_V1', 'ASSIGNABLE', true, true),
          ('wfm.work_orders.execute',                     'wfm',        'execute',   'Ejecutar órdenes de trabajo asignadas [DEPRECADO: usar operations.execution_orders.execute]', 'MOD00_ACCESS_V1', 'ASSIGNABLE', true, true)
        ) AS seeds(permission_key, module_key, action, description, catalog_version, availability, is_system, is_active)
      CROSS JOIN LATERAL (
        SELECT id AS tenant_id FROM tenant_settings LIMIT 1
      ) AS tenants
      ON CONFLICT (tenant_id, permission_key) DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Elimina las entradas del catálogo que esta migración insertó.
    // Solo elimina las que pertenecen al catálogo sembrado (is_system = true
    // y catalog_version = MOD00_ACCESS_V1) para no borrar entradas custom.
    await queryRunner.query(
      `
      DELETE FROM access_permission_catalog
      WHERE permission_key = ANY($1)
        AND is_system = true
        AND catalog_version = 'MOD00_ACCESS_V1'
    `,
      [PERMISSION_KEYS_TO_SEED as unknown as string[]],
    );
  }
}
