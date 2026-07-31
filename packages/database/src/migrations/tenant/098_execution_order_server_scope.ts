import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 098: conserva en MOD11 el alcance server-owned de la OT.
 *
 * Fuente canónica del backfill: schedule_events.organization_site_id, que es
 * la relación WFM aprobada para el sitio de despacho. El scope se copia como
 * referencia lógica; no se crea FK cross-module.
 */
export class ExecutionOrderServerScope0980000000000 implements MigrationInterface {
  name = 'ExecutionOrderServerScope0980000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE execution_orders ADD COLUMN IF NOT EXISTS organization_site_id UUID`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_execution_orders_tenant_organization_site
       ON execution_orders (tenant_id, organization_site_id)`,
    );
    await queryRunner.query(`
      UPDATE execution_orders execution_order
      SET organization_site_id = schedule_event.organization_site_id
      FROM schedule_events schedule_event
      WHERE execution_order.tenant_id = schedule_event.tenant_id
        AND execution_order.schedule_event_id = schedule_event.id
        AND execution_order.organization_site_id IS NULL
        AND schedule_event.organization_site_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      const rows = ((await queryRunner.query(
        `SELECT COUNT(*)::int AS total FROM execution_orders WHERE organization_site_id IS NOT NULL`,
      )) ?? []) as Array<{ total: number }>;
      const total = rows[0]?.total ?? 0;
      if (total > 0) {
        throw new Error(
          `Rollback de ExecutionOrderServerScope bloqueado: ` +
            `organization_site_id conserva ${total} OT(s). Para continuar de forma destructiva, ` +
            `exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true de forma explícita.`,
        );
      }
    }

    await queryRunner.query(`DROP INDEX IF EXISTS idx_execution_orders_tenant_organization_site`);
    await queryRunner.query(
      `ALTER TABLE execution_orders DROP COLUMN IF EXISTS organization_site_id`,
    );
  }
}
