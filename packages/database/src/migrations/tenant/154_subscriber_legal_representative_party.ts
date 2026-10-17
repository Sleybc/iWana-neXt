import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 154: vincula el representante legal del suscriptor con un Party natural.
 * `down()` exige autorización explícita si hay vínculos nuevos que perder.
 */
export class SubscriberLegalRepresentativeParty1540000000000 implements MigrationInterface {
  name = 'SubscriberLegalRepresentativeParty1540000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
           WHERE t.typname = 'party_role_type'
             AND t.typnamespace = current_schema()::regnamespace
             AND e.enumlabel = 'LEGAL_REPRESENTATIVE'
        ) THEN
          ALTER TYPE party_role_type ADD VALUE 'LEGAL_REPRESENTATIVE';
        END IF;
      END $$;
    `);

    const legacyRows = (await queryRunner.query(`
      SELECT COUNT(*)::int AS legacy_count
        FROM subscribers
       WHERE legal_representative_id IS NOT NULL
    `)) as Array<{ legacy_count: number }>;
    const legacyCount = legacyRows[0]?.legacy_count ?? 0;
    if (legacyCount > 0) {
      console.info(
        `[154] ${legacyCount} suscriptores conservan legal_representative_id; el dato legado se mantiene durante la expansión.`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE subscribers
        ADD COLUMN legal_representative_party_id uuid NULL
          REFERENCES party(id) ON DELETE RESTRICT,
        ADD CONSTRAINT ck_subscribers_juridica_legal_representative
          CHECK (person_type <> 'JURIDICA' OR legal_representative_party_id IS NOT NULL) NOT VALID
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      const representativeRows = (await queryRunner.query(`
        SELECT COUNT(*)::int AS representative_count
          FROM subscribers
         WHERE legal_representative_party_id IS NOT NULL
      `)) as Array<{ representative_count: number }>;
      const representativeCount = representativeRows[0]?.representative_count ?? 0;
      if (representativeCount > 0) {
        throw new Error(
          `Rollback de SubscriberLegalRepresentativeParty bloqueado: ${representativeCount} suscriptores tienen Party representante legal. Para continuar de forma destructiva, exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true de forma explícita.`,
        );
      }
    }

    await queryRunner.query(`
      ALTER TABLE subscribers
        DROP CONSTRAINT IF EXISTS ck_subscribers_juridica_legal_representative,
        DROP COLUMN IF EXISTS legal_representative_party_id
    `);

    const roleRows = (await queryRunner.query(`
      SELECT COUNT(*)::int AS role_count
        FROM party_role
       WHERE role::text = 'LEGAL_REPRESENTATIVE'
    `)) as Array<{ role_count: number }>;
    const roleCount = roleRows[0]?.role_count ?? 0;
    if (roleCount > 0) {
      console.warn(
        `[154] down conserva LEGAL_REPRESENTATIVE en party_role_type: ${roleCount} roles lo usan.`,
      );
      return;
    }

    await queryRunner.query(`ALTER TYPE party_role_type RENAME TO party_role_type_old`);
    await queryRunner.query(`
      CREATE TYPE party_role_type AS ENUM (
        'CUSTOMER', 'SUPPLIER', 'EMPLOYEE', 'CONTRACTOR', 'SALES_AGENT'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE party_role
        ALTER COLUMN role TYPE party_role_type
        USING role::text::party_role_type
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS party_role_type_old`);
  }
}
