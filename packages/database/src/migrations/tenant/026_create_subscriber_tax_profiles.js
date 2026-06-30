'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.CreateSubscriberTaxProfiles1700000000026 = void 0;
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
class CreateSubscriberTaxProfiles1700000000026 {
  name = 'CreateSubscriberTaxProfiles1700000000026';
  async up(queryRunner) {
    // ── Tabla: subscriber_tax_profiles ──────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS subscriber_tax_profiles (
        id             UUID        NOT NULL DEFAULT gen_random_uuid(),
        tenant_id      UUID        NOT NULL,
        subscriber_id  UUID        NOT NULL,
        segment        VARCHAR(30),
        stratum_at_suggestion INT,
        profile_status VARCHAR(20) NOT NULL DEFAULT 'PENDING_REVIEW',
        confirmed_at   TIMESTAMPTZ,
        confirmed_by   UUID,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT pk_subscriber_tax_profiles PRIMARY KEY (id)
      )
    `);
    // Unicidad: un suscriptor tiene como máximo un perfil tributario
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_stp_subscriber_id
        ON subscriber_tax_profiles (subscriber_id)
    `);
    // Índice para filtrar por tenant + estado (consultas de facturación)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stp_tenant_status
        ON subscriber_tax_profiles (tenant_id, profile_status)
    `);
    // ── Tabla: subscriber_tax_assignments ───────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS subscriber_tax_assignments (
        id                UUID        NOT NULL DEFAULT gen_random_uuid(),
        tenant_id         UUID        NOT NULL,
        profile_id        UUID        NOT NULL,
        tax_definition_id UUID        NOT NULL,
        tax_name_snapshot VARCHAR(120) NOT NULL,
        effective_rate    NUMERIC(7,4),
        rate_source       VARCHAR(20) NOT NULL DEFAULT 'CATALOG',
        treatment         VARCHAR(20),
        status            VARCHAR(20) NOT NULL DEFAULT 'SUGGESTED',
        reason            VARCHAR(300),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT pk_subscriber_tax_assignments PRIMARY KEY (id),
        CONSTRAINT fk_sta_profile_id
          FOREIGN KEY (profile_id)
          REFERENCES subscriber_tax_profiles (id)
          ON DELETE CASCADE
      )
    `);
    // Índice por perfil (JOIN frecuente al cargar perfil con asignaciones)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sta_profile_id
        ON subscriber_tax_assignments (profile_id)
    `);
    // Índice por tenant + definición (búsquedas de asignaciones de un tributo)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sta_tenant_definition
        ON subscriber_tax_assignments (tenant_id, tax_definition_id)
    `);
    // Unicidad: un tributo se asigna una sola vez por perfil
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sta_profile_definition
        ON subscriber_tax_assignments (profile_id, tax_definition_id)
    `);
  }
  async down(queryRunner) {
    // Eliminar asignaciones primero (FK a perfiles)
    await queryRunner.query(`DROP TABLE IF EXISTS subscriber_tax_assignments`);
    await queryRunner.query(`DROP TABLE IF EXISTS subscriber_tax_profiles`);
  }
}
exports.CreateSubscriberTaxProfiles1700000000026 = CreateSubscriberTaxProfiles1700000000026;
//# sourceMappingURL=026_create_subscriber_tax_profiles.js.map
