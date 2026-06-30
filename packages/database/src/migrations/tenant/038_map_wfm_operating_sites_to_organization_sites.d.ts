import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migración 038: agrega tabla de compatibilidad entre sedes WFM legacy y
 * OrganizationSite sin modificar referencias historicas existentes.
 *
 * Heuristica de backfill:
 * - Solo considera `wfm_operating_sites` activos y no borrados logicamente.
 * - Solo considera `organization_sites` activos y no borrados logicamente.
 * - Inserta mapping solo cuando `tenant_id` y `code` coinciden exactamente.
 * - Omite filas sin match o con mapping activo previo y lo reporta via NOTICE.
 */
export declare class MapWfmOperatingSitesToOrganizationSites1700000000038 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=038_map_wfm_operating_sites_to_organization_sites.d.ts.map