import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 026: Perfil tributario por suscriptor (MVP Taxation por cliente).
 *
 * up():
 *   - Crea tabla subscriber_tax_profiles (perfil 1:1 con subscriber).
 *   - Crea tabla subscriber_tax_assignments (asignaciones tributarias del perfil).
 *   - Crea índices para consultas frecuentes del portal (Suscriptor 360).
 *
 * down() (reversible):
 *   - Elimina subscriber_tax_assignments primero (FK a subscriber_tax_profiles).
 *   - Elimina subscriber_tax_profiles.
 *
 * taxDefinitionId en subscriber_tax_assignments es FK lógica (sin constraint físico)
 * para respetar el boundary entre CRM/Subscribers y TaxationModule — ADR-029 §D4.
 *
 * Ref: spec-2026-04-22 §7.2, §7.3, BT-TAXMVP-02, ADR-029 §D3-D4, ADR-031
 */
export declare class CreateSubscriberTaxProfiles1700000000026 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=026_create_subscriber_tax_profiles.d.ts.map