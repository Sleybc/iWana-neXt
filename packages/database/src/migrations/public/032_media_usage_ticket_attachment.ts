import { MigrationInterface, QueryRunner } from 'typeorm';

const TICKET_ATTACHMENT_USAGE = 'ticket_attachment';

/** Valores de `usage` después de la migración 027. */
const USAGES_BEFORE: readonly string[] = [
  'logo',
  'seal',
  'favicon',
  'login_background',
  'general',
  'execution_evidence',
  'stratum_evidence',
  'privacy_evidence',
];

/** Valores de `usage` después de esta migración. */
const USAGES_AFTER: readonly string[] = [...USAGES_BEFORE, TICKET_ATTACHMENT_USAGE];

/** La lista contiene constantes locales, nunca datos externos. */
function sqlValueList(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(', ');
}

/**
 * Migración 032 — uso `ticket_attachment` en `public.media_assets` (spec MOD09 2026-11-16
 * «adjuntos en tickets» §2.1). Amplía el CHECK de la 027 sin reescribir datos.
 *
 * `down()` falla si queda un asset con este uso, también si está eliminado lógicamente. No
 * borra ni reasigna archivos.
 *
 * Schema: public
 * Reversible: sí, cuando no hay filas con `ticket_attachment`.
 */
export class MediaUsageTicketAttachment1784419220000 implements MigrationInterface {
  name = 'MediaUsageTicketAttachment1784419220000';

  private async assertMediaAssetsTableExists(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT to_regclass('public.media_assets') IS NOT NULL AS present`,
    )) as Array<{ present: boolean }>;

    if (rows[0]?.present !== true) {
      throw new Error(
        'Migración 032 abortada: public.media_assets no existe. ' +
          'Aplique primero 008, 020, 026 y 027.',
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

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.assertMediaAssetsTableExists(queryRunner);
    const definition = await this.readUsageConstraintDefinition(queryRunner);

    if (definition?.toLowerCase().includes(TICKET_ATTACHMENT_USAGE)) {
      return;
    }

    if (definition) {
      const normalized = definition.toLowerCase();
      if (!USAGES_BEFORE.every((value) => normalized.includes(value))) {
        throw new Error(
          'Migración 032 abortada: chk_media_assets_usage existe con una definición ' +
            'incompatible con el estado posterior a la 027.',
        );
      }
    }

    await this.replaceUsageConstraint(queryRunner, USAGES_AFTER);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.assertMediaAssetsTableExists(queryRunner);

    const rows = (await queryRunner.query(
      `SELECT COUNT(*)::int AS total
       FROM "public"."media_assets"
       WHERE "usage" = 'ticket_attachment'`,
    )) as Array<{ total: number }>;
    const total = rows[0]?.total ?? 0;

    if (total > 0) {
      throw new Error(
        `Rollback de MediaUsageTicketAttachment bloqueado: existen ${total} asset(s) con ` +
          "usage = 'ticket_attachment' (incluidos los eliminados lógicamente). Esta migración " +
          'no los borra ni los reasigna; resuélvalos de forma explícita antes de revertir.',
      );
    }

    await this.replaceUsageConstraint(queryRunner, USAGES_BEFORE);
  }
}
