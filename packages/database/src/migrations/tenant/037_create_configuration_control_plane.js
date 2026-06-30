'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.CreateConfigurationControlPlane1700000000037 = void 0;
class CreateConfigurationControlPlane1700000000037 {
  name = 'CreateConfigurationControlPlane1700000000037';
  async up(queryRunner) {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS organization_sites (
        id            UUID          NOT NULL DEFAULT gen_random_uuid(),
        tenant_id     UUID          NOT NULL,
        name          VARCHAR(160)  NOT NULL,
        code          VARCHAR(40)   NOT NULL,
        site_type     VARCHAR(40)   NOT NULL,
        address       VARCHAR(240),
        municipality  VARCHAR(120),
        department    VARCHAR(120),
        country       VARCHAR(2)    NOT NULL DEFAULT 'CO',
        latitude      NUMERIC(10, 7),
        longitude     NUMERIC(10, 7),
        is_primary    BOOLEAN       NOT NULL DEFAULT false,
        is_active     BOOLEAN       NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
        deleted_at    TIMESTAMPTZ,
        CONSTRAINT pk_organization_sites PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_organization_sites_tenant_code
        ON organization_sites (tenant_id, code)
        WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_organization_sites_tenant_primary
        ON organization_sites (tenant_id, is_primary)
        WHERE deleted_at IS NULL AND is_primary = true
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_organization_sites_tenant_active
        ON organization_sites (tenant_id, is_active)
        WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS organization_site_capabilities (
        id            UUID         NOT NULL DEFAULT gen_random_uuid(),
        tenant_id     UUID         NOT NULL,
        site_id       UUID         NOT NULL,
        capability    VARCHAR(40)  NOT NULL,
        is_enabled    BOOLEAN      NOT NULL DEFAULT true,
        CONSTRAINT pk_organization_site_capabilities PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_organization_site_capabilities_site_capability
        ON organization_site_capabilities (tenant_id, site_id, capability)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_organization_site_capabilities_tenant_site
        ON organization_site_capabilities (tenant_id, site_id)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS organization_site_business_hours (
        id            UUID                         NOT NULL DEFAULT gen_random_uuid(),
        tenant_id     UUID                         NOT NULL,
        site_id       UUID                         NOT NULL,
        weekday       business_hours_weekday_enum  NOT NULL,
        opens_at      TIME,
        closes_at     TIME,
        is_open       BOOLEAN                      NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ                  NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ                  NOT NULL DEFAULT now(),
        CONSTRAINT pk_organization_site_business_hours PRIMARY KEY (id),
        CONSTRAINT ck_organization_site_business_hours_window
          CHECK (
            (is_open = false AND opens_at IS NULL AND closes_at IS NULL)
            OR (is_open = true AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at < closes_at)
          )
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_organization_site_business_hours_site_weekday
        ON organization_site_business_hours (tenant_id, site_id, weekday)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_organization_site_business_hours_tenant_site
        ON organization_site_business_hours (tenant_id, site_id)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS organization_site_assignments (
        id               UUID         NOT NULL DEFAULT gen_random_uuid(),
        tenant_id        UUID         NOT NULL,
        site_id          UUID         NOT NULL,
        user_id          UUID         NOT NULL,
        assignment_type  VARCHAR(40)  NOT NULL,
        valid_from       DATE         NOT NULL DEFAULT CURRENT_DATE,
        valid_to         DATE,
        is_active        BOOLEAN      NOT NULL DEFAULT true,
        CONSTRAINT pk_organization_site_assignments PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_organization_site_assignments_tenant_site_active
        ON organization_site_assignments (tenant_id, site_id, is_active)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_organization_site_assignments_tenant_user_active
        ON organization_site_assignments (tenant_id, user_id, is_active)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS organization_site_responsibilities (
        id              UUID         NOT NULL DEFAULT gen_random_uuid(),
        tenant_id       UUID         NOT NULL,
        site_id         UUID         NOT NULL,
        responsibility  VARCHAR(40)  NOT NULL,
        user_id         UUID         NOT NULL,
        valid_from      DATE         NOT NULL DEFAULT CURRENT_DATE,
        valid_to        DATE,
        CONSTRAINT pk_organization_site_responsibilities PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_organization_site_responsibilities_tenant_site
        ON organization_site_responsibilities (tenant_id, site_id)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS access_permission_catalog (
        id               UUID          NOT NULL DEFAULT gen_random_uuid(),
        tenant_id        UUID          NOT NULL,
        permission_key   VARCHAR(120)  NOT NULL,
        module_key       VARCHAR(60)   NOT NULL,
        action           VARCHAR(60)   NOT NULL,
        description      VARCHAR(240)  NOT NULL,
        catalog_version  VARCHAR(40)   NOT NULL,
        availability     VARCHAR(20)   NOT NULL,
        is_system        BOOLEAN       NOT NULL DEFAULT true,
        is_active        BOOLEAN       NOT NULL DEFAULT true,
        CONSTRAINT pk_access_permission_catalog PRIMARY KEY (id),
        CONSTRAINT ck_access_permission_catalog_availability
          CHECK (availability IN ('ASSIGNABLE', 'RESERVED'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_access_permission_catalog_tenant_key
        ON access_permission_catalog (tenant_id, permission_key)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_access_permission_catalog_tenant_module
        ON access_permission_catalog (tenant_id, module_key)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS access_profiles (
        id                    UUID          NOT NULL DEFAULT gen_random_uuid(),
        tenant_id             UUID          NOT NULL,
        name                  VARCHAR(120)  NOT NULL,
        description           TEXT,
        base_role_constraint  VARCHAR(30),
        scope_site_id         UUID,
        is_system             BOOLEAN       NOT NULL DEFAULT false,
        is_active             BOOLEAN       NOT NULL DEFAULT true,
        created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
        updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
        deleted_at            TIMESTAMPTZ,
        CONSTRAINT pk_access_profiles PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_access_profiles_tenant_name
        ON access_profiles (tenant_id, name)
        WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_access_profiles_tenant_active
        ON access_profiles (tenant_id, is_active)
        WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS access_profile_permissions (
        id              UUID          NOT NULL DEFAULT gen_random_uuid(),
        tenant_id       UUID          NOT NULL,
        profile_id      UUID          NOT NULL,
        permission_key  VARCHAR(120)  NOT NULL,
        CONSTRAINT pk_access_profile_permissions PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_access_profile_permissions_profile_permission
        ON access_profile_permissions (tenant_id, profile_id, permission_key)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_access_profile_permissions_tenant_profile
        ON access_profile_permissions (tenant_id, profile_id)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_access_profiles (
        id          UUID        NOT NULL DEFAULT gen_random_uuid(),
        tenant_id   UUID        NOT NULL,
        user_id     UUID        NOT NULL,
        profile_id  UUID        NOT NULL,
        valid_from  DATE        NOT NULL DEFAULT CURRENT_DATE,
        valid_to    DATE,
        is_active   BOOLEAN     NOT NULL DEFAULT true,
        CONSTRAINT pk_user_access_profiles PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_user_access_profiles_active
        ON user_access_profiles (tenant_id, user_id, profile_id)
        WHERE is_active = true
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_user_access_profiles_tenant_user_active
        ON user_access_profiles (tenant_id, user_id, is_active)
    `);
  }
  async down(queryRunner) {
    await queryRunner.query('DROP INDEX IF EXISTS idx_user_access_profiles_tenant_user_active');
    await queryRunner.query('DROP INDEX IF EXISTS uq_user_access_profiles_active');
    await queryRunner.query('DROP TABLE IF EXISTS user_access_profiles');
    await queryRunner.query('DROP INDEX IF EXISTS idx_access_profile_permissions_tenant_profile');
    await queryRunner.query(
      'DROP INDEX IF EXISTS uq_access_profile_permissions_profile_permission',
    );
    await queryRunner.query('DROP TABLE IF EXISTS access_profile_permissions');
    await queryRunner.query('DROP INDEX IF EXISTS idx_access_profiles_tenant_active');
    await queryRunner.query('DROP INDEX IF EXISTS uq_access_profiles_tenant_name');
    await queryRunner.query('DROP TABLE IF EXISTS access_profiles');
    await queryRunner.query('DROP INDEX IF EXISTS idx_access_permission_catalog_tenant_module');
    await queryRunner.query('DROP INDEX IF EXISTS uq_access_permission_catalog_tenant_key');
    await queryRunner.query('DROP TABLE IF EXISTS access_permission_catalog');
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_organization_site_responsibilities_tenant_site',
    );
    await queryRunner.query('DROP TABLE IF EXISTS organization_site_responsibilities');
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_organization_site_assignments_tenant_user_active',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_organization_site_assignments_tenant_site_active',
    );
    await queryRunner.query('DROP TABLE IF EXISTS organization_site_assignments');
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_organization_site_business_hours_tenant_site',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS uq_organization_site_business_hours_site_weekday',
    );
    await queryRunner.query('DROP TABLE IF EXISTS organization_site_business_hours');
    await queryRunner.query('DROP INDEX IF EXISTS idx_organization_site_capabilities_tenant_site');
    await queryRunner.query(
      'DROP INDEX IF EXISTS uq_organization_site_capabilities_site_capability',
    );
    await queryRunner.query('DROP TABLE IF EXISTS organization_site_capabilities');
    await queryRunner.query('DROP INDEX IF EXISTS idx_organization_sites_tenant_active');
    await queryRunner.query('DROP INDEX IF EXISTS uq_organization_sites_tenant_primary');
    await queryRunner.query('DROP INDEX IF EXISTS uq_organization_sites_tenant_code');
    await queryRunner.query('DROP TABLE IF EXISTS organization_sites');
  }
}
exports.CreateConfigurationControlPlane1700000000037 = CreateConfigurationControlPlane1700000000037;
//# sourceMappingURL=037_create_configuration_control_plane.js.map
