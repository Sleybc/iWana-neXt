import { MigrationInterface, QueryRunner } from 'typeorm';

/** Unicidad de la OT derivada por evento de agenda dentro de cada tenant. */
export class ExecutionOrderScheduleUnique0910000000000 implements MigrationInterface {
  name = 'ExecutionOrderScheduleUnique0910000000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_execution_orders_tenant_schedule_event ON execution_orders (tenant_id, schedule_event_id)`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_execution_orders_tenant_schedule_event`);
  }
}
