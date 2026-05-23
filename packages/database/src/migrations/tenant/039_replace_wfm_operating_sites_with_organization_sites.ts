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
export class ReplaceWfmOperatingSitesWithOrganizationSites1700000000039 implements MigrationInterface {
  name = 'ReplaceWfmOperatingSitesWithOrganizationSites1700000000039';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─────────────────────────────────────────────────────────────────
    // 1. Agregar columna organization_site_id a las 5 tablas
    // ─────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE schedule_events
        ADD COLUMN IF NOT EXISTS organization_site_id UUID
    `);

    await queryRunner.query(`
      ALTER TABLE visit_requests
        ADD COLUMN IF NOT EXISTS organization_site_id UUID
    `);

    await queryRunner.query(`
      ALTER TABLE wfm_site_business_hours
        ADD COLUMN IF NOT EXISTS organization_site_id UUID
    `);

    await queryRunner.query(`
      ALTER TABLE wfm_holiday_blackouts
        ADD COLUMN IF NOT EXISTS organization_site_id UUID
    `);

    await queryRunner.query(`
      ALTER TABLE wfm_technician_business_overrides
        ADD COLUMN IF NOT EXISTS organization_site_id UUID
    `);

    // ─────────────────────────────────────────────────────────────────
    // 2. Backfill desde tabla de mapping (usa solo mappings activos)
    // ─────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('wfm_operating_site_organization_site_mappings') IS NOT NULL THEN
          UPDATE schedule_events se
          SET organization_site_id = m.organization_site_id
          FROM wfm_operating_site_organization_site_mappings m
          WHERE m.wfm_operating_site_id = se.operating_site_id
            AND m.deleted_at IS NULL
            AND se.operating_site_id IS NOT NULL;

          UPDATE visit_requests vr
          SET organization_site_id = m.organization_site_id
          FROM wfm_operating_site_organization_site_mappings m
          WHERE m.wfm_operating_site_id = vr.operating_site_id
            AND m.deleted_at IS NULL
            AND vr.operating_site_id IS NOT NULL;

          UPDATE wfm_site_business_hours sbh
          SET organization_site_id = m.organization_site_id
          FROM wfm_operating_site_organization_site_mappings m
          WHERE m.wfm_operating_site_id = sbh.site_id
            AND m.deleted_at IS NULL;

          UPDATE wfm_holiday_blackouts hb
          SET organization_site_id = m.organization_site_id
          FROM wfm_operating_site_organization_site_mappings m
          WHERE m.wfm_operating_site_id = hb.site_id
            AND m.deleted_at IS NULL
            AND hb.site_id IS NOT NULL;

          UPDATE wfm_technician_business_overrides tbo
          SET organization_site_id = m.organization_site_id
          FROM wfm_operating_site_organization_site_mappings m
          WHERE m.wfm_operating_site_id = tbo.site_id
            AND m.deleted_at IS NULL
            AND tbo.site_id IS NOT NULL;
        END IF;
      END$$
    `);

    // ─────────────────────────────────────────────────────────────────
    // 3. Eliminar índices legacy que referencian site_id / operating_site_id
    // ─────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_wfm_site_business_hours_site_weekday
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_wfm_site_business_hours_tenant_site
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_wfm_holiday_blackouts_tenant_site_date
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_wfm_technician_overrides_tenant_site
    `);

    // ─────────────────────────────────────────────────────────────────
    // 4. Eliminar columnas legacy
    // ─────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE schedule_events DROP COLUMN IF EXISTS operating_site_id
    `);
    await queryRunner.query(`
      ALTER TABLE visit_requests DROP COLUMN IF EXISTS operating_site_id
    `);
    await queryRunner.query(`
      ALTER TABLE wfm_site_business_hours DROP COLUMN IF EXISTS site_id
    `);
    await queryRunner.query(`
      ALTER TABLE wfm_holiday_blackouts DROP COLUMN IF EXISTS site_id
    `);
    await queryRunner.query(`
      ALTER TABLE wfm_technician_business_overrides DROP COLUMN IF EXISTS site_id
    `);

    // ─────────────────────────────────────────────────────────────────
    // 5. Recrear índices con la nueva columna organization_site_id
    // ─────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_wfm_site_business_hours_org_site_weekday
        ON wfm_site_business_hours (tenant_id, organization_site_id, weekday)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_wfm_site_business_hours_tenant_org_site
        ON wfm_site_business_hours (tenant_id, organization_site_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_wfm_holiday_blackouts_tenant_org_site_date
        ON wfm_holiday_blackouts (tenant_id, organization_site_id, blackout_date)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_wfm_technician_overrides_tenant_org_site
        ON wfm_technician_business_overrides (tenant_id, organization_site_id)
    `);

    // ─────────────────────────────────────────────────────────────────
    // 6. Eliminar índices de las tablas legacy antes de dropearlas
    // ─────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_wfm_operating_site_org_site_mappings_wfm_active
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_wfm_operating_site_org_site_mappings_org_active
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_wfm_operating_sites_tenant_name
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_wfm_operating_sites_tenant_code
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_wfm_operating_sites_tenant_active
    `);

    // ─────────────────────────────────────────────────────────────────
    // 7. Eliminar tablas legacy
    // ─────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      DROP TABLE IF EXISTS wfm_operating_site_organization_site_mappings
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS wfm_operating_sites
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ─────────────────────────────────────────────────────────────────
    // Recrear tablas legacy (vacías — datos históricos son irrecuperables)
    // ─────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wfm_operating_sites (
        id           UUID        NOT NULL DEFAULT gen_random_uuid(),
        tenant_id    UUID        NOT NULL,
        name         VARCHAR(120) NOT NULL,
        code         VARCHAR(40)  NOT NULL,
        address      VARCHAR(255),
        municipality VARCHAR(120),
        sector       VARCHAR(120),
        latitude     NUMERIC(10,7),
        longitude    NUMERIC(10,7),
        is_active    BOOLEAN     NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at   TIMESTAMPTZ,
        CONSTRAINT pk_wfm_operating_sites PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_wfm_operating_sites_tenant_name
        ON wfm_operating_sites (tenant_id, name)
        WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_wfm_operating_sites_tenant_code
        ON wfm_operating_sites (tenant_id, code)
        WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_wfm_operating_sites_tenant_active
        ON wfm_operating_sites (tenant_id, is_active)
        WHERE deleted_at IS NULL
    `);

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

    // ─────────────────────────────────────────────────────────────────
    // Eliminar índices nuevos (dependen de organization_site_id)
    // ─────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_wfm_site_business_hours_org_site_weekday
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_wfm_site_business_hours_tenant_org_site
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_wfm_holiday_blackouts_tenant_org_site_date
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_wfm_technician_overrides_tenant_org_site
    `);

    // ─────────────────────────────────────────────────────────────────
    // Restaurar columnas legacy
    // ─────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE schedule_events
        ADD COLUMN IF NOT EXISTS operating_site_id UUID
    `);
    await queryRunner.query(`
      ALTER TABLE visit_requests
        ADD COLUMN IF NOT EXISTS operating_site_id UUID
    `);
    await queryRunner.query(`
      ALTER TABLE wfm_site_business_hours
        ADD COLUMN IF NOT EXISTS site_id UUID
    `);
    await queryRunner.query(`
      ALTER TABLE wfm_holiday_blackouts
        ADD COLUMN IF NOT EXISTS site_id UUID
    `);
    await queryRunner.query(`
      ALTER TABLE wfm_technician_business_overrides
        ADD COLUMN IF NOT EXISTS site_id UUID
    `);

    // ─────────────────────────────────────────────────────────────────
    // Recrear índices legacy
    // ─────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_wfm_site_business_hours_site_weekday
        ON wfm_site_business_hours (tenant_id, site_id, weekday)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_wfm_site_business_hours_tenant_site
        ON wfm_site_business_hours (tenant_id, site_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_wfm_holiday_blackouts_tenant_site_date
        ON wfm_holiday_blackouts (tenant_id, site_id, blackout_date)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_wfm_technician_overrides_tenant_site
        ON wfm_technician_business_overrides (tenant_id, site_id)
    `);

    // ─────────────────────────────────────────────────────────────────
    // Eliminar columnas nuevas
    // ─────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE schedule_events DROP COLUMN IF EXISTS organization_site_id
    `);
    await queryRunner.query(`
      ALTER TABLE visit_requests DROP COLUMN IF EXISTS organization_site_id
    `);
    await queryRunner.query(`
      ALTER TABLE wfm_site_business_hours DROP COLUMN IF EXISTS organization_site_id
    `);
    await queryRunner.query(`
      ALTER TABLE wfm_holiday_blackouts DROP COLUMN IF EXISTS organization_site_id
    `);
    await queryRunner.query(`
      ALTER TABLE wfm_technician_business_overrides DROP COLUMN IF EXISTS organization_site_id
    `);
  }
}
