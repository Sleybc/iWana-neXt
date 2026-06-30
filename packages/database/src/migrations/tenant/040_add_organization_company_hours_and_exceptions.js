'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.Mod00HorarioBaseEmpresaExcepciones1748000000000 = void 0;
/**
 * MOD00 — Horario base empresa + Excepciones por fecha para Organization.
 *
 * Crea:
 * - organization_company_business_hours: horario semanal base a nivel empresa.
 * - organization_business_hours_exceptions: excepciones por fecha (festivos,
 *   cierres especiales, aperturas extraordinarias).
 *
 * Backfill:
 * - Si existe una sede primaria con horario configurado en
 *   organization_site_business_hours, copia esas filas al horario base empresa
 *   como punto de partida inicial.
 *
 * NO modifica organization_site_business_hours (pasa a semántica override-only).
 * NO toca wfm_site_business_hours (deprecado, limpieza en fase posterior).
 *
 * Reversible: DOWN elimina tablas creadas sin tocar datos existentes.
 */
class Mod00HorarioBaseEmpresaExcepciones1748000000000 {
  name = 'Mod00HorarioBaseEmpresaExcepciones1748000000000';
  async up(queryRunner) {
    // ── 1. Horario base empresa ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS organization_company_business_hours (
        id            UUID                        NOT NULL DEFAULT gen_random_uuid(),
        tenant_id     UUID                        NOT NULL,
        weekday       business_hours_weekday_enum NOT NULL,
        opens_at      TIME,
        closes_at     TIME,
        is_open       BOOLEAN                     NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ                 NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ                 NOT NULL DEFAULT now(),
        CONSTRAINT pk_org_company_business_hours PRIMARY KEY (id),
        CONSTRAINT ck_org_company_business_hours_window
          CHECK (
            (is_open = false AND opens_at IS NULL AND closes_at IS NULL)
            OR
            (is_open = true AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at < closes_at)
          )
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_org_company_business_hours_tenant_weekday
        ON organization_company_business_hours (tenant_id, weekday)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_org_company_business_hours_tenant
        ON organization_company_business_hours (tenant_id)
    `);
    // ── 2. Excepciones por fecha ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS organization_business_hours_exceptions (
        id                      UUID        NOT NULL DEFAULT gen_random_uuid(),
        tenant_id               UUID        NOT NULL,
        organization_site_id    UUID,
        exception_date          DATE        NOT NULL,
        is_recurring            BOOLEAN     NOT NULL DEFAULT false,
        is_open                 BOOLEAN     NOT NULL DEFAULT false,
        opens_at                TIME,
        closes_at               TIME,
        name                    VARCHAR(160) NOT NULL,
        description             TEXT,
        created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT pk_org_business_hours_exceptions PRIMARY KEY (id),
        CONSTRAINT ck_org_bh_exceptions_window
          CHECK (
            (is_open = false AND opens_at IS NULL AND closes_at IS NULL)
            OR
            (is_open = true AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND opens_at < closes_at)
          )
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_org_bh_exceptions_tenant
        ON organization_business_hours_exceptions (tenant_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_org_bh_exceptions_tenant_date
        ON organization_business_hours_exceptions (tenant_id, exception_date)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_org_bh_exceptions_tenant_site
        ON organization_business_hours_exceptions (tenant_id, organization_site_id)
    `);
    // ── 3. Backfill inicial desde sede primaria ──────────────────────────────
    // Para cada tenant que tenga una sede primaria con horario configurado en
    // organization_site_business_hours, copiar esas filas al horario base empresa.
    // Solo se hace el backfill si aún no existen filas en el horario base empresa
    // para ese tenant (idempotente).
    await queryRunner.query(`
      INSERT INTO organization_company_business_hours
        (tenant_id, weekday, opens_at, closes_at, is_open)
      SELECT
        osbh.tenant_id,
        osbh.weekday,
        osbh.opens_at,
        osbh.closes_at,
        osbh.is_open
      FROM organization_site_business_hours osbh
      INNER JOIN organization_sites os
        ON os.id = osbh.site_id
        AND os.tenant_id = osbh.tenant_id
        AND os.is_primary = true
      WHERE NOT EXISTS (
        SELECT 1
        FROM organization_company_business_hours ocbh
        WHERE ocbh.tenant_id = osbh.tenant_id
      )
      ON CONFLICT DO NOTHING
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(`DROP TABLE IF EXISTS organization_business_hours_exceptions`);
    await queryRunner.query(`DROP TABLE IF EXISTS organization_company_business_hours`);
  }
}
exports.Mod00HorarioBaseEmpresaExcepciones1748000000000 =
  Mod00HorarioBaseEmpresaExcepciones1748000000000;
//# sourceMappingURL=040_add_organization_company_hours_and_exceptions.js.map
