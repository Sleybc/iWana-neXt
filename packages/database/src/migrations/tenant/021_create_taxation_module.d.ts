import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 021: crea el esquema del Módulo Taxation (MOD07).
 * - Tabla tax_definitions con catálogo unificado de impuestos por tenant.
 * - Índices: unicidad (code), contexto+activo, categoría.
 *
 * Schema: tenant (search_path resuelto por TenantContext — sin prefijo explícito)
 * Reversible: sí — down() elimina la tabla completa.
 *
 * Referencias: HLD-MOD07-TAXATION-v1.0 §4, ADR-029
 */
export declare class CreateTaxationModule1700000000021 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=021_create_taxation_module.d.ts.map