import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 094: plantillas versionadas, requisitos declarativos,
 * gate de cierre determinista y alineación de entidades existentes.
 *
 * - DATA-P0-2: inventory_request_id y movement_status en ItemUsage
 * - DATA-P1-2: UNIQUE (tenant_id, media_asset_id) en Evidence
 * - DATA-P1-3: INMUTABILIDAD DE VERSIONES PUBLICADAS (enforced en capa de servicio)
 * - DATA-P1-4: índice (tenant_id, inventory_request_id) en ItemUsage
 * - Template catalog + versiones + requisitos
 * - Columnas de plantilla en execution_orders
 * - media_asset_id, requirement_key, asset_status en evidence
 *
 * Schema: tenant (search_path)
 * Reversible: sí
 */
export class TemplateVersioningAndClosureGate0940000000000 implements MigrationInterface {
  name = 'TemplateVersioningAndClosureGate0940000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── DATA-P0-2 & DATA-P1-4: ItemUsage alignment ──────────────────────
    await queryRunner.query(
      `ALTER TABLE execution_order_item_usage
       ADD COLUMN IF NOT EXISTS inventory_request_id UUID`,
    );
    await queryRunner.query(
      `ALTER TABLE execution_order_item_usage
       ADD COLUMN IF NOT EXISTS movement_status VARCHAR(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE execution_order_item_usage
       ADD CONSTRAINT chk_execution_order_item_usage_movement_status
       CHECK (movement_status IS NULL OR movement_status IN ('PENDING','CONFIRMED','REJECTED'))`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_execution_order_item_usage_inventory_request
       ON execution_order_item_usage (tenant_id, inventory_request_id)`,
    );

    // ── DATA-P1-2: Evidence media_asset_id + uniqueness ─────────────────
    await queryRunner.query(
      `ALTER TABLE execution_order_evidence
       ADD COLUMN IF NOT EXISTS media_asset_id UUID`,
    );
    await queryRunner.query(
      `ALTER TABLE execution_order_evidence
       ADD COLUMN IF NOT EXISTS requirement_key VARCHAR(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE execution_order_evidence
       ADD COLUMN IF NOT EXISTS asset_status VARCHAR(32)`,
    );
    // Unique constraint: un media_asset no puede enlazarse dos veces en el mismo tenant
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_execution_order_evidence_tenant_media_asset
       ON execution_order_evidence (tenant_id, media_asset_id)`,
    );

    // ── Template reference columns on execution_orders ──────────────────
    await queryRunner.query(
      `ALTER TABLE execution_orders
       ADD COLUMN IF NOT EXISTS template_id UUID`,
    );
    await queryRunner.query(
      `ALTER TABLE execution_orders
       ADD COLUMN IF NOT EXISTS template_version_id UUID`,
    );
    await queryRunner.query(
      `ALTER TABLE execution_orders
       ADD COLUMN IF NOT EXISTS template_key VARCHAR(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE execution_orders
       ADD COLUMN IF NOT EXISTS template_version_number INTEGER`,
    );
    await queryRunner.query(
      `ALTER TABLE execution_orders
       ADD COLUMN IF NOT EXISTS template_label VARCHAR(200)`,
    );
    await queryRunner.query(
      `ALTER TABLE execution_orders
       ADD COLUMN IF NOT EXISTS template_requirements_snapshot JSONB`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_execution_orders_template_version
       ON execution_orders (template_version_id)`,
    );

    // ── Template catalog ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS execution_order_templates (
        id          UUID        NOT NULL DEFAULT gen_random_uuid(),
        tenant_id   UUID        NOT NULL,
        key         VARCHAR(64) NOT NULL,
        label       VARCHAR(200) NOT NULL,
        work_type   wfm_work_type NOT NULL,
        status      VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_execution_order_templates PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_execution_order_templates_tenant_key
       ON execution_order_templates (tenant_id, key)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_execution_order_templates_tenant_work_type
       ON execution_order_templates (tenant_id, work_type)`,
    );

    // ── Template versions ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS execution_order_template_versions (
        id               UUID        NOT NULL DEFAULT gen_random_uuid(),
        tenant_id        UUID        NOT NULL,
        template_id      UUID        NOT NULL,
        template_key     VARCHAR(64) NOT NULL,
        version          INTEGER     NOT NULL,
        label            VARCHAR(200) NOT NULL,
        status           VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
        effective_from   TIMESTAMPTZ,
        reason_catalogs  JSONB,
        published_at     TIMESTAMPTZ,
        retired_at       TIMESTAMPTZ,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_execution_order_template_versions PRIMARY KEY (id),
        CONSTRAINT fk_execution_order_template_versions_template
          FOREIGN KEY (template_id) REFERENCES execution_order_templates(id)
          ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_execution_order_template_versions_template
       ON execution_order_template_versions (template_id)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_order_template_versions_key_version
       ON execution_order_template_versions (tenant_id, template_key, version)`,
    );

    // ── Template requirements ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS execution_order_template_requirements (
        id          UUID         NOT NULL DEFAULT gen_random_uuid(),
        tenant_id   UUID         NOT NULL,
        version_id  UUID         NOT NULL,
        key         VARCHAR(64)  NOT NULL,
        label       VARCHAR(200) NOT NULL,
        required    BOOLEAN      NOT NULL DEFAULT TRUE,
        kind        VARCHAR(20)  NOT NULL,
        config      JSONB,
        sort_order  INTEGER      NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_execution_order_template_requirements PRIMARY KEY (id),
        CONSTRAINT fk_execution_order_template_requirements_version
          FOREIGN KEY (version_id) REFERENCES execution_order_template_versions(id)
          ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_execution_order_template_requirements_version
       ON execution_order_template_requirements (version_id)`,
    );

    // ── Add CHECK constraint for template status ────────────────────────
    await queryRunner.query(
      `ALTER TABLE execution_order_templates
       ADD CONSTRAINT chk_execution_order_templates_status
       CHECK (status IN ('DRAFT','PUBLISHED','RETIRED'))`,
    );
    await queryRunner.query(
      `ALTER TABLE execution_order_template_versions
       ADD CONSTRAINT chk_execution_order_template_versions_status
       CHECK (status IN ('DRAFT','PUBLISHED','RETIRED'))`,
    );
    await queryRunner.query(
      `ALTER TABLE execution_order_template_requirements
       ADD CONSTRAINT chk_execution_order_template_requirements_kind
       CHECK (kind IN ('FIELD','ACTIVITY','MEASUREMENT','EVIDENCE','MATERIAL','COMPLIANCE'))`,
    );
  }

  private async assertTableEmpty(queryRunner: QueryRunner, tableName: string): Promise<void> {
    const result = (await queryRunner.query(
      `SELECT COUNT(*) AS cnt FROM "${tableName}"`,
    )) as Array<{ cnt: string }>;
    const count = Number.parseInt(result[0]?.cnt ?? '0', 10);
    if (count > 0) {
      throw new Error(
        `Reversión bloqueada: la tabla "${tableName}" contiene ${count} fila(s). ` +
          `Respalde los datos y ejecute un script de migración de datos explícito antes de revertir.`,
      );
    }
  }

  private async assertColumnEmpty(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
  ): Promise<void> {
    const result = (await queryRunner.query(
      `SELECT COUNT(*) AS cnt FROM "${tableName}" WHERE "${columnName}" IS NOT NULL`,
    )) as Array<{ cnt: string }>;
    const count = Number.parseInt(result[0]?.cnt ?? '0', 10);
    if (count > 0) {
      throw new Error(
        `Reversión bloqueada: la columna "${columnName}" de "${tableName}" contiene ${count} valor(es) no nulo(s). ` +
          `Respalde los datos y ejecute un script de migración de datos explícito antes de revertir.`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ── Drop check constraints ──────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE execution_order_template_requirements
       DROP CONSTRAINT IF EXISTS chk_execution_order_template_requirements_kind`,
    );
    await queryRunner.query(
      `ALTER TABLE execution_order_template_versions
       DROP CONSTRAINT IF EXISTS chk_execution_order_template_versions_status`,
    );
    await queryRunner.query(
      `ALTER TABLE execution_order_templates
       DROP CONSTRAINT IF EXISTS chk_execution_order_templates_status`,
    );

    // ── Drop requirements ───────────────────────────────────────────────
    // P0-5: no destruir datos poblados silenciosamente
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_execution_order_template_requirements_version`,
    );
    await this.assertTableEmpty(queryRunner, 'execution_order_template_requirements');
    await queryRunner.query(`DROP TABLE IF EXISTS execution_order_template_requirements`);

    // ── Drop versions ───────────────────────────────────────────────────
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_execution_order_template_versions_key_version`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS idx_execution_order_template_versions_template`);
    await this.assertTableEmpty(queryRunner, 'execution_order_template_versions');
    await queryRunner.query(`DROP TABLE IF EXISTS execution_order_template_versions`);

    // ── Drop templates ──────────────────────────────────────────────────
    await queryRunner.query(`DROP INDEX IF EXISTS idx_execution_order_templates_tenant_work_type`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_execution_order_templates_tenant_key`);
    await this.assertTableEmpty(queryRunner, 'execution_order_templates');
    await queryRunner.query(`DROP TABLE IF EXISTS execution_order_templates`);

    // ── Drop execution_orders template columns ──────────────────────────
    // Columnas agregadas como nullable en up(); down() seguro solo si no contienen datos.
    await queryRunner.query(`DROP INDEX IF EXISTS idx_execution_orders_template_version`);
    await this.assertColumnEmpty(queryRunner, 'execution_orders', 'template_requirements_snapshot');
    await this.assertColumnEmpty(queryRunner, 'execution_orders', 'template_label');
    await this.assertColumnEmpty(queryRunner, 'execution_orders', 'template_version_number');
    await this.assertColumnEmpty(queryRunner, 'execution_orders', 'template_key');
    await this.assertColumnEmpty(queryRunner, 'execution_orders', 'template_version_id');
    await this.assertColumnEmpty(queryRunner, 'execution_orders', 'template_id');
    await queryRunner.query(
      `ALTER TABLE execution_orders DROP COLUMN IF EXISTS template_requirements_snapshot`,
    );
    await queryRunner.query(`ALTER TABLE execution_orders DROP COLUMN IF EXISTS template_label`);
    await queryRunner.query(
      `ALTER TABLE execution_orders DROP COLUMN IF EXISTS template_version_number`,
    );
    await queryRunner.query(`ALTER TABLE execution_orders DROP COLUMN IF EXISTS template_key`);
    await queryRunner.query(
      `ALTER TABLE execution_orders DROP COLUMN IF EXISTS template_version_id`,
    );
    await queryRunner.query(`ALTER TABLE execution_orders DROP COLUMN IF EXISTS template_id`);

    // ── Drop evidence columns ───────────────────────────────────────────
    await queryRunner.query(`DROP INDEX IF EXISTS uq_execution_order_evidence_tenant_media_asset`);
    await this.assertColumnEmpty(queryRunner, 'execution_order_evidence', 'asset_status');
    await this.assertColumnEmpty(queryRunner, 'execution_order_evidence', 'requirement_key');
    await this.assertColumnEmpty(queryRunner, 'execution_order_evidence', 'media_asset_id');
    await queryRunner.query(
      `ALTER TABLE execution_order_evidence DROP COLUMN IF EXISTS asset_status`,
    );
    await queryRunner.query(
      `ALTER TABLE execution_order_evidence DROP COLUMN IF EXISTS requirement_key`,
    );
    await queryRunner.query(
      `ALTER TABLE execution_order_evidence DROP COLUMN IF EXISTS media_asset_id`,
    );

    // ── Drop item_usage columns ─────────────────────────────────────────
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_execution_order_item_usage_inventory_request`,
    );
    await queryRunner.query(
      `ALTER TABLE execution_order_item_usage
       DROP CONSTRAINT IF EXISTS chk_execution_order_item_usage_movement_status`,
    );
    await this.assertColumnEmpty(queryRunner, 'execution_order_item_usage', 'movement_status');
    await this.assertColumnEmpty(queryRunner, 'execution_order_item_usage', 'inventory_request_id');
    await queryRunner.query(
      `ALTER TABLE execution_order_item_usage DROP COLUMN IF EXISTS movement_status`,
    );
    await queryRunner.query(
      `ALTER TABLE execution_order_item_usage DROP COLUMN IF EXISTS inventory_request_id`,
    );
  }
}
