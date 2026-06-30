'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.CreateTaxationModule1700000000021 = void 0;
/**
 * Migración 021: crea el esquema del Módulo Taxation (MOD07).
 * - Tabla tax_definitions con catálogo unificado de impuestos por tenant.
 * - Índices: unicidad (code), contexto+activo, categoría.
 *
 * Schema: tenant (search_path resuelto por TenantContext — sin prefijo explícito)
 * Reversible: sí — down() elimina la tabla completa.
 *
 * Referencias: HLD-MOD07-TAXATION-v1.0 §4, ADR-029
 */
class CreateTaxationModule1700000000021 {
  name = 'CreateTaxationModule1700000000021';
  async up(queryRunner) {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS tax_definitions (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        code VARCHAR(32) NOT NULL,
        name VARCHAR(120) NOT NULL,
        category VARCHAR(20) NOT NULL
          CHECK (category IN ('VAT','WITHHOLDING','MUNICIPAL','STAMP','OTHER')),
        jurisdiction_level VARCHAR(20) NOT NULL
          CHECK (jurisdiction_level IN ('NATIONAL','DEPARTMENT','MUNICIPAL')),
        municipality_code VARCHAR(8),
        base_rate NUMERIC(7,4),
        treatment VARCHAR(20) NOT NULL
          CHECK (treatment IN ('STANDARD','EXEMPT','EXCLUDED','FIXED')),
        context VARCHAR(10) NOT NULL
          CHECK (context IN ('SALES','PURCHASE','BOTH')),
        origin VARCHAR(10) NOT NULL DEFAULT 'CUSTOM'
          CHECK (origin IN ('SYSTEM','CUSTOM')),
        is_active BOOLEAN NOT NULL DEFAULT true,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT pk_tax_definitions PRIMARY KEY (id),
        CONSTRAINT uq_tax_definitions_code UNIQUE (code)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tax_definitions_context_active
      ON tax_definitions (context, is_active)
      WHERE is_active = true AND deleted_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tax_definitions_category
      ON tax_definitions (category)
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tax_definitions_category`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tax_definitions_context_active`);
    await queryRunner.query(`DROP TABLE IF EXISTS tax_definitions`);
  }
}
exports.CreateTaxationModule1700000000021 = CreateTaxationModule1700000000021;
//# sourceMappingURL=021_create_taxation_module.js.map
