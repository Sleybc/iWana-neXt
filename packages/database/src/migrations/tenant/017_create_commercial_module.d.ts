import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 017: crea el esquema del Módulo Comercial (MOD06).
 * - 11 tablas nuevas: tax_classifications, tax_rules, catalog_items,
 *   plan_details, product_details, service_details, catalog_price_history,
 *   catalog_bundles, catalog_bundle_items, catalog_promotions,
 *   catalog_compatibility_rules
 * - Índices según HLD-MOD06 sección 5
 * - Seed de clasificaciones tributarias base colombianas y reglas por defecto
 *
 * Schema: tenant (search_path se resuelve por TenantContext — sin prefijo explícito)
 * Reversible: sí — down() elimina todas las tablas en orden inverso de dependencias
 */
export declare class CreateCommercialModule1700000000017 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=017_create_commercial_module.d.ts.map