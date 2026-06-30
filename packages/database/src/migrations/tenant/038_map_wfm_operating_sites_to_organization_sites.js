'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.MapWfmOperatingSitesToOrganizationSites1700000000038 = void 0;
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
class MapWfmOperatingSitesToOrganizationSites1700000000038 {
  name = 'MapWfmOperatingSitesToOrganizationSites1700000000038';
  async up(queryRunner) {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wfm_operating_site_organization_site_mappings (
        id                     UUID        NOT NULL DEFAULT gen_random_uuid(),
        tenant_id              UUID        NOT NULL,
        wfm_operating_site_id  UUID        NOT NULL,
        organization_site_id   UUID        NOT NULL,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at             TIMESTAMPTZ,
        CONSTRAINT pk_wfm_operating_site_organization_site_mappings PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_wfm_operating_site_org_site_mappings_wfm_active
        ON wfm_operating_site_organization_site_mappings (tenant_id, wfm_operating_site_id)
        WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_wfm_operating_site_org_site_mappings_org_active
        ON wfm_operating_site_organization_site_mappings (tenant_id, organization_site_id)
        WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      DO $$
      DECLARE
        total_active_wfm              integer := 0;
        exact_code_matches            integer := 0;
        inserted_mappings             integer := 0;
        skipped_without_match         integer := 0;
        skipped_existing_active_map   integer := 0;
      BEGIN
        IF to_regclass('wfm_operating_sites') IS NULL OR to_regclass('organization_sites') IS NULL THEN
          RAISE NOTICE '[038] Backfill omitido en schema %: faltan tablas base requeridas.', current_schema();
          RETURN;
        END IF;

        SELECT COUNT(*)
          INTO total_active_wfm
        FROM wfm_operating_sites w
        WHERE w.deleted_at IS NULL
          AND w.is_active = true;

        SELECT COUNT(*)
          INTO exact_code_matches
        FROM wfm_operating_sites w
        WHERE w.deleted_at IS NULL
          AND w.is_active = true
          AND EXISTS (
            SELECT 1
            FROM organization_sites o
            WHERE o.tenant_id = w.tenant_id
              AND o.code = w.code
              AND o.deleted_at IS NULL
              AND o.is_active = true
          );

        WITH inserted AS (
          INSERT INTO wfm_operating_site_organization_site_mappings (
            tenant_id,
            wfm_operating_site_id,
            organization_site_id
          )
          SELECT
            w.tenant_id,
            w.id,
            o.id
          FROM wfm_operating_sites w
          JOIN organization_sites o
            ON o.tenant_id = w.tenant_id
           AND o.code = w.code
          WHERE w.deleted_at IS NULL
            AND w.is_active = true
            AND o.deleted_at IS NULL
            AND o.is_active = true
            AND NOT EXISTS (
              SELECT 1
              FROM wfm_operating_site_organization_site_mappings m
              WHERE m.tenant_id = w.tenant_id
                AND m.deleted_at IS NULL
                AND (
                  m.wfm_operating_site_id = w.id
                  OR m.organization_site_id = o.id
                )
            )
          RETURNING 1
        )
        SELECT COUNT(*)
          INTO inserted_mappings
        FROM inserted;

        skipped_without_match := GREATEST(total_active_wfm - exact_code_matches, 0);
        skipped_existing_active_map := GREATEST(exact_code_matches - inserted_mappings, 0);

        RAISE NOTICE
          '[038] Backfill mapping WFM->Organization en schema %: activos=%, matches_por_code=%, insertados=%, omitidos_sin_match=%, omitidos_por_mapping_existente=%',
          current_schema(),
          total_active_wfm,
          exact_code_matches,
          inserted_mappings,
          skipped_without_match,
          skipped_existing_active_map;
      END $$;
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(
      'DROP INDEX IF EXISTS uq_wfm_operating_site_org_site_mappings_org_active',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS uq_wfm_operating_site_org_site_mappings_wfm_active',
    );
    await queryRunner.query('DROP TABLE IF EXISTS wfm_operating_site_organization_site_mappings');
  }
}
exports.MapWfmOperatingSitesToOrganizationSites1700000000038 =
  MapWfmOperatingSitesToOrganizationSites1700000000038;
//# sourceMappingURL=038_map_wfm_operating_sites_to_organization_sites.js.map
