import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 025: deprecación controlada del módulo tributario legacy.
 *
 * up():
 *   - Elimina las columnas legacy estrato_min y estrato_max de tax_rules
 *     (reemplazadas por stratum_from/stratum_to en migración 020).
 *   - Elimina la tabla tax_classifications (motor legacy reemplazado por
 *     TaxDefinition + tax_rule_applications en MOD07).
 *
 * down() (reversible):
 *   - Recrea tax_classifications con la estructura original de migración 017.
 *   - Restaura las columnas estrato_min y estrato_max en tax_rules.
 *
 * Ref: ADR-031 §D6, ADR-032, programa TAXATION-PARTIES F6
 */
export declare class DeprecateLegacyTaxation1700000000025 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=025_deprecate_legacy_taxation.d.ts.map