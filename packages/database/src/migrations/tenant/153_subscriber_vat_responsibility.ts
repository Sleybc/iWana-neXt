import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 153: expande la clasificación fiscal del suscriptor.
 * `down()` conserva la responsabilidad de IVA en `tax_regime`; las
 * responsabilidades del RUT requieren autorización explícita para perderse.
 */
export class SubscriberVatResponsibility1530000000000 implements MigrationInterface {
  name = 'SubscriberVatResponsibility1530000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE vat_responsibility_enum AS ENUM ('RESPONSABLE', 'NO_RESPONSABLE')
    `);
    await queryRunner.query(`
      ALTER TABLE subscribers
        ADD COLUMN vat_responsibility vat_responsibility_enum,
        ADD COLUMN rut_responsibilities text[] NOT NULL DEFAULT '{}'
    `);
    await queryRunner.query(`
      UPDATE subscribers SET vat_responsibility = CASE tax_regime
        WHEN 'SIMPLIFIED' THEN 'NO_RESPONSABLE'::vat_responsibility_enum
        ELSE 'RESPONSABLE'::vat_responsibility_enum END
    `);
    await queryRunner.query(`
      ALTER TABLE subscribers
        ALTER COLUMN vat_responsibility SET NOT NULL,
        ALTER COLUMN tax_regime DROP NOT NULL,
        ADD CONSTRAINT ck_subscribers_rut_responsibilities_known
          CHECK (rut_responsibilities <@ ARRAY['O-13','O-15','O-23','O-47','R-99-PN']::text[])
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      const rutRows = (await queryRunner.query(`
        SELECT COUNT(*)::int AS rut_count
          FROM subscribers
         WHERE cardinality(rut_responsibilities) > 0
      `)) as Array<{ rut_count: number }>;
      const rutCount = rutRows[0]?.rut_count ?? 0;
      if (rutCount > 0) {
        throw new Error(
          `Rollback de SubscriberVatResponsibility bloqueado: ${rutCount} suscriptores tienen responsabilidades del RUT. Para continuar de forma destructiva, exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true de forma explícita.`,
        );
      }
    }

    await queryRunner.query(`
      UPDATE subscribers SET tax_regime = CASE vat_responsibility::text
        WHEN 'NO_RESPONSABLE' THEN 'SIMPLIFIED'::tax_regime_enum
        WHEN 'RESPONSABLE' THEN 'COMMON'::tax_regime_enum
        ELSE NULL END
    `);
    const unmapped = (await queryRunner.query(`
      SELECT COUNT(*)::int AS unmapped_count
        FROM subscribers
       WHERE tax_regime IS NULL
    `)) as Array<{ unmapped_count: number }>;
    const unmappedCount = unmapped[0]?.unmapped_count ?? 0;

    if (unmappedCount > 0) {
      throw new Error(
        `Migración 153 down abortada: ${unmappedCount} suscriptores no permiten restaurar tax_regime y conservan tax_regime NULL. Resolverlos antes de revertir.`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE subscribers
        ALTER COLUMN tax_regime SET NOT NULL,
        DROP CONSTRAINT IF EXISTS ck_subscribers_rut_responsibilities_known,
        DROP COLUMN IF EXISTS rut_responsibilities,
        DROP COLUMN IF EXISTS vat_responsibility
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS vat_responsibility_enum`);
  }
}
