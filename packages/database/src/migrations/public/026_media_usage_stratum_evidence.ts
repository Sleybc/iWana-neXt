import { MigrationInterface, QueryRunner } from 'typeorm';

const STRATUM_EVIDENCE_USAGE = 'stratum_evidence';

/** Valores de `usage` tras la 020: el estado que esta migración encuentra. */
const USAGES_BEFORE: readonly string[] = [
  'logo',
  'seal',
  'favicon',
  'login_background',
  'general',
  'execution_evidence',
];

/** Valores de `usage` tras esta migración. */
const USAGES_AFTER: readonly string[] = [...USAGES_BEFORE, STRATUM_EVIDENCE_USAGE];

/** Lista SQL de valores. Solo recibe constantes de este módulo, nunca entrada externa. */
function sqlValueList(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(', ');
}

/**
 * Migración 026 — uso dedicado `stratum_evidence` en `public.media_assets`.
 *
 * ADR-093 D5 y C-MEDIA-1 v1.0 (PROMPT-MOD05-IVA-PDF-v1.0): el soporte del estrato
 * (PDF, JPEG, PNG o WEBP) deja de compartir uso con los assets genéricos. Solo
 * amplía el CHECK `chk_media_assets_usage`; no añade columnas ni reescribe filas.
 *
 * Idempotente, con el patrón de la 020: si el CHECK ya admite `stratum_evidence`
 * no hace nada; si existe con una definición que no es la del estado 020, aborta
 * antes de tocar nada.
 *
 * `down()` no borra ni reasigna datos. Aborta si queda alguna fila con
 * `usage = 'stratum_evidence'`, también las eliminadas lógicamente, porque el CHECK
 * anterior no podría volver a cumplirse con ellas.
 *
 * Schema: public
 * Reversible: sí, salvo con filas `stratum_evidence` (el down las bloquea, no las pierde)
 *
 * ADR-093 D5 · ADR-034 — Bounded Context Media/Assets
 */
export class MediaUsageStratumEvidence1784419214000 implements MigrationInterface {
  // El sufijo es el timestamp que TypeORM usa para ordenar: debe ser posterior a
  // la 025 (1784419213000), no el número de archivo 026.
  name = 'MediaUsageStratumEvidence1784419214000';

  private async assertMediaAssetsTableExists(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT to_regclass('public.media_assets') IS NOT NULL AS present`,
    )) as Array<{ present: boolean }>;

    if (rows[0]?.present !== true) {
      throw new Error(
        'Migración 026 abortada: public.media_assets no existe. ' +
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

    if (definition?.toLowerCase().includes(STRATUM_EVIDENCE_USAGE)) {
      return;
    }

    if (definition) {
      const normalized = definition.toLowerCase();
      if (!USAGES_BEFORE.every((value) => normalized.includes(value))) {
        throw new Error(
          'Migración 026 abortada: chk_media_assets_usage existe con una definición ' +
            'incompatible con el estado previo de la 020.',
        );
      }
    }

    await this.replaceUsageConstraint(queryRunner, USAGES_AFTER);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fail-closed: la 026 solo modifica la tabla canónica de la 008. No crea una
    // tabla alternativa ni acepta un estado previo desconocido.
    await this.assertMediaAssetsTableExists(queryRunner);
    await this.ensureUsageConstraint(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.assertMediaAssetsTableExists(queryRunner);

    // Aborta antes de cualquier DDL. No borra ni reasigna: la resolución de estas
    // filas es una decisión explícita del operador, no un efecto del rollback.
    const rows = (await queryRunner.query(
      `SELECT COUNT(*)::int AS total
       FROM "public"."media_assets"
       WHERE "usage" = 'stratum_evidence'`,
    )) as Array<{ total: number }>;
    const total = rows[0]?.total ?? 0;

    if (total > 0) {
      throw new Error(
        `Rollback de MediaUsageStratumEvidence bloqueado: existen ${total} asset(s) con ` +
          "usage = 'stratum_evidence' (incluidos los eliminados lógicamente). Esta migración " +
          'no los borra ni los reasigna; resuélvalos de forma explícita antes de revertir.',
      );
    }

    await this.replaceUsageConstraint(queryRunner, USAGES_BEFORE);
  }
}
