import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAcquisitionChannelAndSalesAttributions1700000000007
  implements MigrationInterface
{
  name = 'AddAcquisitionChannelAndSalesAttributions1700000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE expediente_records
      ADD COLUMN IF NOT EXISTS acquisition_channel VARCHAR(30) NOT NULL DEFAULT 'OTRO',
      ADD COLUMN IF NOT EXISTS source_detail VARCHAR(255)
    `);

    await queryRunner.query(`
      UPDATE expediente_records
      SET source_detail = source
      WHERE source IS NOT NULL
        AND source <> ''
        AND source_detail IS NULL
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN expediente_records.source
      IS 'DEPRECATED: usar acquisition_channel + source_detail'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sales_attributions (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        expediente_id UUID NOT NULL,
        attribution_role VARCHAR(30) NOT NULL DEFAULT 'ORIGINATOR',
        actor_id UUID NOT NULL,
        actor_role VARCHAR(30) NOT NULL,
        actor_name VARCHAR(160) NOT NULL,
        acquisition_channel VARCHAR(30) NOT NULL,
        notes VARCHAR(500),
        attributed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        attributed_by UUID NOT NULL,
        revoked_at TIMESTAMPTZ,
        revoked_by UUID,
        revoked_reason VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_sales_attributions PRIMARY KEY (id),
        CONSTRAINT fk_sales_attributions_expediente FOREIGN KEY (expediente_id)
          REFERENCES expediente_records(id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sales_attr_tenant_expediente
      ON sales_attributions (tenant_id, expediente_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sales_attr_actor
      ON sales_attributions (tenant_id, actor_id)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_attr_active
      ON sales_attributions (expediente_id)
      WHERE revoked_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_sales_attr_active`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sales_attr_actor`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sales_attr_tenant_expediente`);
    await queryRunner.query(`DROP TABLE IF EXISTS sales_attributions`);

    await queryRunner.query(`
      ALTER TABLE expediente_records
      DROP COLUMN IF EXISTS source_detail,
      DROP COLUMN IF EXISTS acquisition_channel
    `);
  }
}
