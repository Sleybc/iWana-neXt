import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 018: migra datos del catálogo heredado al nuevo esquema comercial (MOD06).
 *
 * Origen:
 *   - plan_catalog_items   → catalog_items (type=PLAN) + plan_details + catalog_price_history
 *   - additional_products  → catalog_items (type=PRODUCT) + product_details
 *
 * Estrategia:
 *   - Aditiva: las tablas origen NO se eliminan (se deprecan).
 *   - Transaccional: si falla cualquier paso, se revierte todo.
 *   - La clasificación tributaria IVA_FULL se asigna por defecto a todos los ítems
 *     migrados; el administrador puede reclasificarlos desde la UI.
 *   - El precio SCD se crea con valid_from = created_at del plan origen.
 *   - created_by del precio SCD usa el tenant_id como proxy (no hay userId disponible
 *     en migración; se documenta como valor de sistema).
 *
 * Reversibilidad: down() trunca las tablas nuevas (no recupera datos origen).
 *
 * Schema: tenant (search_path resuelto por TenantContext — sin prefijo explícito)
 */
export declare class MigrateCatalogData1700000000018 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=018_migrate_catalog_data.d.ts.map