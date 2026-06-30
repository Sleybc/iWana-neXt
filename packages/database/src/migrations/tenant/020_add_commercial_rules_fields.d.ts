import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 020: extiende las tablas de reglas comerciales con campos del diseño aprobado.
 *
 * catalog_compatibility_rules:
 *   - effective_from DATE: desde cuándo aplica la sugerencia al cotizar
 *   - note TEXT: mensaje visible al agente (sustituye/complementa description)
 *   - updated_at TIMESTAMPTZ: trazabilidad de cambios
 *   - UNIQUE (source_item_id) WHERE is_active = true: un ítem → un sucesor activo
 *
 * tax_classifications:
 *   - applies_iva BOOLEAN: el ítem está sujeto a IVA
 *   - applies_retefuente BOOLEAN: aplica retención en la fuente
 *   - applies_rete_ica BOOLEAN: aplica ReteICA
 *   - applies_estampillas BOOLEAN: aplica estampillas
 *   - is_system BOOLEAN: clasificaciones base no eliminables por UI
 *
 * tax_rules:
 *   - stratum_from SMALLINT: estrato mínimo (inclusive), null = sin restricción
 *   - stratum_to SMALLINT: estrato máximo (inclusive), null = sin restricción
 *   - priority SMALLINT: mayor número = mayor precedencia al resolver solapamientos
 *
 * Schema: tenant (search_path resuelto por TenantContext — sin prefijo)
 * Reversible: sí
 */
export declare class AddCommercialRulesFields1700000000020 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=020_add_commercial_rules_fields.d.ts.map