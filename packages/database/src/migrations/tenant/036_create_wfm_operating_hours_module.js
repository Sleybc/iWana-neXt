'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.CreateWfmOperatingHoursModule1700000000036 = void 0;
class CreateWfmOperatingHoursModule1700000000036 {
  name = 'CreateWfmOperatingHoursModule1700000000036';
  async up(queryRunner) {
    await queryRunner.query(`
      DO $$
      BEGIN
        CREATE TYPE business_hours_weekday_enum AS ENUM (
          'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wfm_operating_sites (
        id            UUID          NOT NULL DEFAULT gen_random_uuid(),
        tenant_id     UUID          NOT NULL,
        name          VARCHAR(120)  NOT NULL,
        code          VARCHAR(40)   NOT NULL,
        address       VARCHAR(255),
        municipality  VARCHAR(120),
        sector        VARCHAR(120),
        latitude      NUMERIC(10, 7),
        longitude     NUMERIC(10, 7),
        is_active     BOOLEAN       NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
        deleted_at    TIMESTAMPTZ,
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
      CREATE TABLE IF NOT EXISTS wfm_company_business_hours (
        id           UUID                         NOT NULL DEFAULT gen_random_uuid(),
        tenant_id    UUID                         NOT NULL,
        weekday      business_hours_weekday_enum  NOT NULL,
        start_time   TIME,
        end_time     TIME,
        is_enabled   BOOLEAN                      NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ                  NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ                  NOT NULL DEFAULT now(),
        CONSTRAINT pk_wfm_company_business_hours PRIMARY KEY (id),
        CONSTRAINT ck_wfm_company_business_hours_window
          CHECK (
            (is_enabled = false AND start_time IS NULL AND end_time IS NULL)
            OR (is_enabled = true AND start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)
          )
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_wfm_company_business_hours_tenant_weekday
        ON wfm_company_business_hours (tenant_id, weekday)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wfm_site_business_hours (
        id           UUID                         NOT NULL DEFAULT gen_random_uuid(),
        tenant_id    UUID                         NOT NULL,
        site_id      UUID                         NOT NULL,
        weekday      business_hours_weekday_enum  NOT NULL,
        start_time   TIME,
        end_time     TIME,
        is_enabled   BOOLEAN                      NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ                  NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ                  NOT NULL DEFAULT now(),
        CONSTRAINT pk_wfm_site_business_hours PRIMARY KEY (id),
        CONSTRAINT ck_wfm_site_business_hours_window
          CHECK (
            (is_enabled = false AND start_time IS NULL AND end_time IS NULL)
            OR (is_enabled = true AND start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)
          )
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_wfm_site_business_hours_site_weekday
        ON wfm_site_business_hours (tenant_id, site_id, weekday)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_wfm_site_business_hours_tenant_site
        ON wfm_site_business_hours (tenant_id, site_id)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wfm_technician_business_overrides (
        id             UUID                         NOT NULL DEFAULT gen_random_uuid(),
        tenant_id      UUID                         NOT NULL,
        user_id        UUID                         NOT NULL,
        site_id        UUID,
        override_date  DATE,
        weekday        business_hours_weekday_enum,
        start_time     TIME,
        end_time       TIME,
        is_enabled     BOOLEAN                      NOT NULL DEFAULT true,
        reason         VARCHAR(160),
        created_at     TIMESTAMPTZ                  NOT NULL DEFAULT now(),
        updated_at     TIMESTAMPTZ                  NOT NULL DEFAULT now(),
        CONSTRAINT pk_wfm_technician_business_overrides PRIMARY KEY (id),
        CONSTRAINT ck_wfm_technician_overrides_scope
          CHECK (override_date IS NOT NULL OR weekday IS NOT NULL),
        CONSTRAINT ck_wfm_technician_overrides_window
          CHECK (
            (is_enabled = false AND start_time IS NULL AND end_time IS NULL)
            OR (is_enabled = true AND start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)
          )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_wfm_technician_overrides_tenant_user_date
        ON wfm_technician_business_overrides (tenant_id, user_id, override_date)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_wfm_technician_overrides_tenant_user_weekday
        ON wfm_technician_business_overrides (tenant_id, user_id, weekday)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_wfm_technician_overrides_tenant_site
        ON wfm_technician_business_overrides (tenant_id, site_id)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wfm_holiday_blackouts (
        id             UUID          NOT NULL DEFAULT gen_random_uuid(),
        tenant_id      UUID          NOT NULL,
        site_id        UUID,
        blackout_date  DATE          NOT NULL,
        is_recurring   BOOLEAN       NOT NULL DEFAULT false,
        name           VARCHAR(120)  NOT NULL,
        description    VARCHAR(255),
        is_enabled     BOOLEAN       NOT NULL DEFAULT true,
        created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
        updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT pk_wfm_holiday_blackouts PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_wfm_holiday_blackouts_tenant_date
        ON wfm_holiday_blackouts (tenant_id, blackout_date)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_wfm_holiday_blackouts_tenant_site_date
        ON wfm_holiday_blackouts (tenant_id, site_id, blackout_date)
    `);
    await queryRunner.query(`
      ALTER TABLE schedule_events
      ADD COLUMN IF NOT EXISTS operating_site_id UUID
    `);
    await queryRunner.query(`
      ALTER TABLE visit_requests
      ADD COLUMN IF NOT EXISTS operating_site_id UUID
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(`ALTER TABLE visit_requests DROP COLUMN IF EXISTS operating_site_id`);
    await queryRunner.query(`ALTER TABLE schedule_events DROP COLUMN IF EXISTS operating_site_id`);
    await queryRunner.query('DROP INDEX IF EXISTS idx_wfm_holiday_blackouts_tenant_site_date');
    await queryRunner.query('DROP INDEX IF EXISTS idx_wfm_holiday_blackouts_tenant_date');
    await queryRunner.query('DROP TABLE IF EXISTS wfm_holiday_blackouts');
    await queryRunner.query('DROP INDEX IF EXISTS idx_wfm_technician_overrides_tenant_site');
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_wfm_technician_overrides_tenant_user_weekday',
    );
    await queryRunner.query('DROP INDEX IF EXISTS idx_wfm_technician_overrides_tenant_user_date');
    await queryRunner.query('DROP TABLE IF EXISTS wfm_technician_business_overrides');
    await queryRunner.query('DROP INDEX IF EXISTS idx_wfm_site_business_hours_tenant_site');
    await queryRunner.query('DROP INDEX IF EXISTS uq_wfm_site_business_hours_site_weekday');
    await queryRunner.query('DROP TABLE IF EXISTS wfm_site_business_hours');
    await queryRunner.query('DROP INDEX IF EXISTS uq_wfm_company_business_hours_tenant_weekday');
    await queryRunner.query('DROP TABLE IF EXISTS wfm_company_business_hours');
    await queryRunner.query('DROP INDEX IF EXISTS idx_wfm_operating_sites_tenant_active');
    await queryRunner.query('DROP INDEX IF EXISTS uq_wfm_operating_sites_tenant_code');
    await queryRunner.query('DROP INDEX IF EXISTS uq_wfm_operating_sites_tenant_name');
    await queryRunner.query('DROP TABLE IF EXISTS wfm_operating_sites');
    await queryRunner.query('DROP TYPE IF EXISTS business_hours_weekday_enum');
  }
}
exports.CreateWfmOperatingHoursModule1700000000036 = CreateWfmOperatingHoursModule1700000000036;
//# sourceMappingURL=036_create_wfm_operating_hours_module.js.map
