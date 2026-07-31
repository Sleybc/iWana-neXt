import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 020 — Agrega columnas de ciclo de vida de evidencia a media_assets.
 *
 * ADR-068: MOD11 crea upload-intent; Media/Assets conserva binario, metadata,
 * análisis y lifecycle. Esta migración agrega:
 * - asset_status: estado del asset (QUARANTINED → AVAILABLE / REJECTED / EXPIRED)
 * - claim_ref: referencia opaca de quién reclamó el asset (tenant:executionOrderId)
 * - checksum_sha256: hash SHA-256 del contenido binario
 *
 * Schema: public
 * Reversible: sí — down() elimina las columnas agregadas
 *
 * ADR-068 — Sincronización de OT de ejecución y proyecciones operativas
 * ADR-034 — Bounded Context Media/Assets
 */
export class AddMediaAssetStatusAndClaim0200000000000 implements MigrationInterface {
  name = 'AddMediaAssetStatusAndClaim0200000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── asset_status: estado del asset en el ciclo de vida de evidencia ────
    await queryRunner.query(
      `ALTER TABLE "public"."media_assets"
       ADD COLUMN IF NOT EXISTS "asset_status" VARCHAR(32) NOT NULL DEFAULT 'AVAILABLE'`,
    );

    // ── claim_ref: referencia opaca [tenantSchema]:[executionOrderId] ──────
    await queryRunner.query(
      `ALTER TABLE "public"."media_assets"
       ADD COLUMN IF NOT EXISTS "claim_ref" VARCHAR(500)`,
    );

    // ── checksum_sha256: hash SHA-256 del contenido para verificaciones ────
    await queryRunner.query(
      `ALTER TABLE "public"."media_assets"
       ADD COLUMN IF NOT EXISTS "checksum_sha256" CHAR(64)`,
    );

    // ── Update CHECK constraint on usage to include execution_evidence ──────
    await queryRunner.query(
      `ALTER TABLE "public"."media_assets"
       DROP CONSTRAINT IF EXISTS "chk_media_assets_usage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."media_assets"
       ADD CONSTRAINT "chk_media_assets_usage" CHECK (
         "usage" IN (
           'logo', 'seal', 'favicon', 'login_background', 'general',
           'execution_evidence'
         )
       )`,
    );

    // ── CHECK constraint on asset_status ────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "public"."media_assets"
       ADD CONSTRAINT "chk_media_assets_asset_status" CHECK (
         "asset_status" IN ('QUARANTINED', 'AVAILABLE', 'REJECTED', 'EXPIRED', 'DELETED')
       )`,
    );

    // ── Index for orphan detection ──────────────────────────────────────────
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_media_assets_status_claim"
       ON "public"."media_assets" ("asset_status", "claim_ref")
       WHERE "deleted_at" IS NULL`,
    );

    // ── Index for checksum lookups ──────────────────────────────────────────
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_media_assets_checksum"
       ON "public"."media_assets" ("checksum_sha256")
       WHERE "checksum_sha256" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const destructiveDown = process.env[DESTRUCTIVE_DOWN_ENV_VAR] === 'true';
    if (!destructiveDown) {
      const rows = ((await queryRunner.query(
        `SELECT "id"
         FROM "public"."media_assets"
         WHERE "usage" = 'execution_evidence'
            OR "claim_ref" IS NOT NULL
            OR "checksum_sha256" IS NOT NULL
            OR "asset_status" IS DISTINCT FROM 'AVAILABLE'
         LIMIT 1`,
      )) ?? []) as Array<{ id: string }>;
      if (rows.length > 0) {
        throw new Error(
          `Rollback de AddMediaAssetStatusAndClaim bloqueado: existen datos de evidencia ` +
            `o lifecycle que no pertenecen al esquema anterior. Para continuar de forma ` +
            `destructiva, exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true de forma explícita.`,
        );
      }
    }

    // El CHECK histórico no admite execution_evidence. Con el flag explícito
    // el operador acepta perder esos assets; eliminarlos aquí evita que la
    // reinstalación del CHECK falle por filas que ya no son válidas para el
    // esquema anterior. Sin el flag, la guarda anterior aborta antes de tocar
    // datos o DDL.
    if (destructiveDown) {
      await queryRunner.query(
        `DELETE FROM "public"."media_assets" WHERE "usage" = 'execution_evidence'`,
      );
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_media_assets_checksum"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_media_assets_status_claim"`);
    await queryRunner.query(
      `ALTER TABLE "public"."media_assets"
       DROP CONSTRAINT IF EXISTS "chk_media_assets_asset_status"`,
    );
    // Revert usage check to original (without execution_evidence). No se
    // reescriben filas: con datos de evidencia el guard bloquea el down, y el
    // flag explícito documenta la pérdida para el procedimiento destructivo.
    await queryRunner.query(
      `ALTER TABLE "public"."media_assets"
       DROP CONSTRAINT IF EXISTS "chk_media_assets_usage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."media_assets"
       ADD CONSTRAINT "chk_media_assets_usage" CHECK (
         "usage" IN ('logo', 'seal', 'favicon', 'login_background', 'general')
       )`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."media_assets"
       DROP COLUMN IF EXISTS "checksum_sha256"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."media_assets"
       DROP COLUMN IF EXISTS "claim_ref"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."media_assets"
       DROP COLUMN IF EXISTS "asset_status"`,
    );
  }
}
