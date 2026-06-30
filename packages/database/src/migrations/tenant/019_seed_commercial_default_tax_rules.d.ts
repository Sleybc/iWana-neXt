import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 019: siembra reglas tributarias base de MOD06 para tenants ya migrados.
 *
 * Cubre la brecha entre las clasificaciones base creadas en migraciones previas
 * y las reglas por defecto esperadas por el PRD/HLD/prompt de ejecución.
 *
 * Estrategia:
 * - Idempotente: cada insert verifica si la regla ya existe para el tenant.
 * - Conservadora: no altera reglas activas existentes creadas por usuarios.
 * - Usa tenant_id como created_by técnico, consistente con la migración 018.
 */
export declare class SeedCommercialDefaultTaxRules1700000000019 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=019_seed_commercial_default_tax_rules.d.ts.map