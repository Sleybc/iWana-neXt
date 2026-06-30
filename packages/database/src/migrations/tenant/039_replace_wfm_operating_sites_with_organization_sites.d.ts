import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 039: retiro estructural completo de WfmOperatingSite.
 *
 * Backfilla `organization_site_id` en las 5 tablas que referencian sedes via el
 * sistema legacy (mapping 038), renombra columnas a la nueva nomenclatura y elimina
 * las tablas `wfm_operating_site_organization_site_mappings` y `wfm_operating_sites`.
 *
 * Tablas afectadas (columna renombrada):
 *   - schedule_events:                 operating_site_id  → organization_site_id
 *   - visit_requests:                  operating_site_id  → organization_site_id
 *   - wfm_site_business_hours:         site_id            → organization_site_id
 *   - wfm_holiday_blackouts:           site_id            → organization_site_id
 *   - wfm_technician_business_overrides: site_id          → organization_site_id
 *
 * El down() recrea la estructura vacía sin recuperar datos históricos de mapping
 * (irreversible en datos, reversible en esquema).
 *
 * ADR-040, HLD-MOD09-PROGRAMACION-WFM-v1.0 §4
 */
export declare class ReplaceWfmOperatingSitesWithOrganizationSites1700000000039 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=039_replace_wfm_operating_sites_with_organization_sites.d.ts.map