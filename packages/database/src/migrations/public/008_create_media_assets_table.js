'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.CreateMediaAssetsTable1746000001000 = void 0;
/**
 * Migración 008 — Tabla media_assets en schema público.
 *
 * Crea la tabla que registra todos los archivos subidos via el módulo Media.
 * Los archivos físicos viven en MinIO (ADR-033).
 * Cada fila representa un asset vinculado a un tenant (o 'platform' para assets globales).
 *
 * Schema: public
 * Reversible: sí — down() elimina la tabla completa
 *
 * ADR-034 — Bounded Context Media/Assets
 * HLD-TRANSVERSAL-MEDIA-ASSETS-v1.0
 */
class CreateMediaAssetsTable1746000001000 {
  name = 'CreateMediaAssetsTable1746000001000';
  async up(queryRunner) {
    // Crear tabla principal
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "public"."media_assets" (
        "id"                    uuid          NOT NULL DEFAULT gen_random_uuid(),
        "tenant_schema"         varchar(63)   NOT NULL,
        "usage"                 varchar(30)   NOT NULL DEFAULT 'general',
        "theme_variant"         varchar(10)   NULL,
        "original_filename"     varchar(255)  NOT NULL,
        "mime_type"             varchar(100)  NOT NULL,
        "ext"                   varchar(20)   NOT NULL,
        "size_bytes"            integer       NOT NULL,
        "object_key"            varchar(500)  NOT NULL,
        "public_url"            varchar(1000) NULL,
        "uploaded_by_user_id"   varchar(36)   NULL,
        "created_at"            timestamptz   NOT NULL DEFAULT now(),
        "updated_at"            timestamptz   NOT NULL DEFAULT now(),
        "deleted_at"            timestamptz   NULL,
        CONSTRAINT "pk_media_assets" PRIMARY KEY ("id"),
        CONSTRAINT "uq_media_assets_object_key" UNIQUE ("object_key"),
        CONSTRAINT "chk_media_assets_usage" CHECK (
          "usage" IN ('logo', 'seal', 'favicon', 'login_background', 'general')
        ),
        CONSTRAINT "chk_media_assets_theme_variant" CHECK (
          "theme_variant" IS NULL OR "theme_variant" IN ('light', 'dark')
        ),
        CONSTRAINT "chk_media_assets_size_positive" CHECK ("size_bytes" > 0)
      )
    `);
    // Índices para consultas frecuentes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_media_assets_tenant_schema"
      ON "public"."media_assets" ("tenant_schema")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_media_assets_usage"
      ON "public"."media_assets" ("usage")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_media_assets_tenant_usage"
      ON "public"."media_assets" ("tenant_schema", "usage")
    `);
    // Índice parcial para soft delete — búsquedas de assets activos
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_media_assets_active"
      ON "public"."media_assets" ("tenant_schema", "usage")
      WHERE "deleted_at" IS NULL
    `);
    // Trigger para actualizar updated_at automáticamente
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.update_media_assets_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "trg_media_assets_updated_at"
      BEFORE UPDATE ON "public"."media_assets"
      FOR EACH ROW EXECUTE FUNCTION public.update_media_assets_updated_at()
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "trg_media_assets_updated_at" ON "public"."media_assets"`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS public.update_media_assets_updated_at()`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_media_assets_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_media_assets_tenant_usage"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_media_assets_usage"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_media_assets_tenant_schema"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "public"."media_assets"`);
  }
}
exports.CreateMediaAssetsTable1746000001000 = CreateMediaAssetsTable1746000001000;
//# sourceMappingURL=008_create_media_assets_table.js.map
