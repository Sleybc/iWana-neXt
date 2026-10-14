import { MigrationInterface, QueryRunner } from 'typeorm';

const PRIVACY_EVIDENCE_USAGE = 'privacy_evidence';

/** Valores de `usage` después de la migración 026. */
const USAGES_BEFORE: readonly string[] = [
  'logo',
  'seal',
  'favicon',
  'login_background',
  'general',
  'execution_evidence',
  'stratum_evidence',
];

/** Valores de `usage` después de esta migración. */
const USAGES_AFTER: readonly string[] = [...USAGES_BEFORE, PRIVACY_EVIDENCE_USAGE];

/** La lista contiene constantes locales, nunca datos externos. */
function sqlValueList(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(', ');
}

/**
 * Migración 027 — uso dedicado `privacy_evidence` en `public.media_assets`.
 * Amplía el CHECK instalado por la 026 sin reescribir datos.
 *
 * `down()` falla si queda un asset con este uso, también si está eliminado
 * lógicamente. No borra ni reasigna evidencia.
 *
 * Schema: public
 * Reversible: sí, cuando no hay filas que dependan de `privacy_evidence`.
 */
export class MediaUsagePrivacyEvidence1784419215000 implements MigrationInterface {
  name = 'MediaUsagePrivacyEvidence1784419215000';

  private async assertMediaAssetsTableExists(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT to_regclass('public.media_assets') IS NOT NULL AS present`,
    )) as Array<{ present: boolean }>;

    if (rows[0]?.present !== true) {
      throw new Error(
        'Migración 027 abortada: public.media_assets no existe. ' +
          'Aplique primero 008_create_media_assets_table y 020_add_media_asset_status_and_claim.',
      );
    }
  }

  private async readUsageConstraintDefinition(
    queryRunner: QueryRunner,
  ): Promise<string | undefined> {
    const rows = (await queryRunner.query(
      `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conrelid = 'public.media_assets'::regclass
         AND conname = 'chk_media_assets_usage'`,
    )) as Array<{ definition: string }>;

    return rows[0]?.definition;
  }

  private async replaceUsageConstraint(
    queryRunner: QueryRunner,
    usages: readonly string[],
  ): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "public"."media_assets"
       DROP CONSTRAINT IF EXISTS "chk_media_assets_usage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."media_assets"
       ADD CONSTRAINT "chk_media_assets_usage" CHECK (
         "usage" IN (${sqlValueList(usages)})
       )`,
    );
  }

  private async ensureUsageConstraint(queryRunner: QueryRunner): Promise<void> {
    const definition = await this.readUsageConstraintDefinition(queryRunner);

    if (definition?.toLowerCase().includes(PRIVACY_EVIDENCE_USAGE)) {
      return;
    }

    if (definition) {
      const normalized = definition.toLowerCase();
      if (!USAGES_BEFORE.every((value) => normalized.includes(value))) {
        throw new Error(
          'Migración 027 abortada: chk_media_assets_usage existe con una definición ' +
            'incompatible con el estado posterior a la 026.',
        );
      }
    }

    await this.replaceUsageConstraint(queryRunner, USAGES_AFTER);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.assertMediaAssetsTableExists(queryRunner);
    await this.ensureUsageConstraint(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.assertMediaAssetsTableExists(queryRunner);

    const rows = (await queryRunner.query(
      `SELECT COUNT(*)::int AS total
       FROM "public"."media_assets"
       WHERE "usage" = 'privacy_evidence'`,
    )) as Array<{ total: number }>;
    const total = rows[0]?.total ?? 0;

    if (total > 0) {
      throw new Error(
        `Rollback de MediaUsagePrivacyEvidence bloqueado: existen ${total} asset(s) con ` +
          "usage = 'privacy_evidence' (incluidos los eliminados lógicamente). Esta migración " +
          'no los borra ni los reasigna; resuélvalos de forma explícita antes de revertir.',
      );
    }

    await this.replaceUsageConstraint(queryRunner, USAGES_BEFORE);
  }
}
