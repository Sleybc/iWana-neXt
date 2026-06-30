import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 023: tabla puente tax_rule_applications (MOD06 ↔ MOD07).
 *
 * Vincula reglas de aplicación de CommercialModule con definiciones de impuestos
 * de TaxationModule. Las FKs son lógicas (sin constraints físicas) para
 * respetar el boundary entre bounded contexts.
 *
 * Backfill idempotente: intenta crear filas cruzando tax_rules con tax_definitions
 * donde code = tax_type. Puede no encontrar coincidencias si los presets de
 * Taxation (IVA_19, IVA_EXENTO, etc.) no coinciden con los valores legacy de
 * tax_type ('IVA', 'RETENTION', 'ICA'). En ese caso se omite el registro
 * (no falla la migración).
 *
 * Schema: tenant — search_path resuelto por el runner (sin prefijo explícito).
 * Reversible: sí — down() elimina la tabla.
 *
 * Ref: HLD-MOD06-TAXATION-DEPENDENCY-v1.1-addendum §4, ADR-031 §D5
 */
export declare class CreateTaxRuleApplications1700000000023 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=023_create_tax_rule_applications.d.ts.map