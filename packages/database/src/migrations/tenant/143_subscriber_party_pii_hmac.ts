import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 143 — C-DDL-1 (MOD05 subscribers remediation, B1).
 *
 * Expands tenant storage for deterministic party identity and encrypted contact
 * fields. Existing plaintext/source columns remain during the expansion; the
 * bounded backfill CLI populates the new fields and later work owns cutover.
 */
export class AddSubscriberPartyPiiHmac1430000000000 implements MigrationInterface {
  name = 'AddSubscriberPartyPiiHmac1430000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const duplicateExpedientes = (await queryRunner.query(`
      SELECT expediente_id, COUNT(*)::int AS subscriber_count,
             ARRAY_AGG(id ORDER BY id) AS subscriber_ids
        FROM subscribers
       WHERE expediente_id IS NOT NULL AND deleted_at IS NULL
       GROUP BY expediente_id
      HAVING COUNT(*) > 1
       ORDER BY expediente_id
       LIMIT 50
    `)) as Array<{ expediente_id: string; subscriber_count: number; subscriber_ids: string[] }>;

    if (duplicateExpedientes.length > 0) {
      const report = duplicateExpedientes
        .map(
          ({ expediente_id, subscriber_count, subscriber_ids }) =>
            `${expediente_id} (${subscriber_count}; subscribers=${subscriber_ids.join(',')})`,
        )
        .join('; ');
      throw new Error(
        `Migración 143 abortada: hay expedientes con múltiples suscriptores activos. ` +
          `Resolver manualmente antes de crear uq_subscribers_expediente. Grupos (máx. 50): ${report}`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE party
        ADD COLUMN IF NOT EXISTS document_number_hmac varchar(64)
    `);
    await queryRunner.query(`
      ALTER TABLE party_contact
        ADD COLUMN IF NOT EXISTS value_encrypted varchar(500),
        ADD COLUMN IF NOT EXISTS value_hmac varchar(64)
    `);
    await queryRunner.query(`
      ALTER TABLE subscribers
        ADD COLUMN IF NOT EXISTS whatsapp_encrypted varchar(500),
        ADD COLUMN IF NOT EXISTS whatsapp_hmac varchar(64)
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_party_document_active`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_party_document_hmac_active
        ON party (document_type, document_number_hmac)
        WHERE deleted_at IS NULL AND status <> 'MERGED' AND document_number_hmac IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_subscribers_search_trgm
        ON subscribers USING GIN (
          (coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' ||
           coalesce(business_name,'') || ' ' || coalesce(commercial_name,'')) public.gin_trgm_ops
        ) WHERE deleted_at IS NULL
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_subscribers_tenant_doc`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_subscribers_tenant_email`);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_subscribers_expediente
        ON subscribers (expediente_id)
        WHERE expediente_id IS NOT NULL AND deleted_at IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS crm_conversion_failures (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id       uuid NOT NULL,
        expediente_id   uuid NOT NULL REFERENCES expediente_records(id),
        event_name      varchar(80) NOT NULL,
        error_code      varchar(80) NOT NULL,
        attempts        int NOT NULL DEFAULT 1,
        first_failed_at timestamptz NOT NULL DEFAULT now(),
        last_failed_at  timestamptz NOT NULL DEFAULT now(),
        resolved_at     timestamptz NULL,
        resolved_by     uuid NULL,
        CONSTRAINT uq_crm_conversion_failure UNIQUE (expediente_id, event_name)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS crm_conversion_failures`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_subscribers_expediente`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_subscribers_search_trgm`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_subscribers_tenant_email ON subscribers (tenant_id, email_encrypted)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_subscribers_tenant_doc ON subscribers (tenant_id, document_number_encrypted)`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS uq_party_document_hmac_active`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_party_document_active
        ON party (document_type, document_number)
        WHERE deleted_at IS NULL AND status != 'MERGED'
    `);
    await queryRunner.query(`
      ALTER TABLE subscribers
        DROP COLUMN IF EXISTS whatsapp_hmac,
        DROP COLUMN IF EXISTS whatsapp_encrypted
    `);
    await queryRunner.query(`
      ALTER TABLE party_contact
        DROP COLUMN IF EXISTS value_hmac,
        DROP COLUMN IF EXISTS value_encrypted
    `);
    await queryRunner.query(`ALTER TABLE party DROP COLUMN IF EXISTS document_number_hmac`);
  }
}
