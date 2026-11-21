import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 033 — índices del dashboard de plataforma (PROMPT-WEB-DASHBOARD-OLA2-v1.0 §A, E-4).
 *
 * - `idx_tenants_status`: `GET /tenants/summary` agrupa por `status` y filtra los que
 *   requieren atención.
 * - `idx_pal_created_id`: el listado de auditoría de plataforma pagina con cursor compuesto
 *   `(created_at, id)` en orden descendente.
 *
 * Solo crea índices; no toca datos.
 *
 * Schema: public
 * Reversible: sí.
 */
export class DashboardStatusAndAuditCursorIndexes1784419221000 implements MigrationInterface {
  name = 'DashboardStatusAndAuditCursorIndexes1784419221000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE INDEX "idx_tenants_status" ON "public"."tenants" ("status")`);
    await queryRunner.query(
      `CREATE INDEX "idx_pal_created_id" ON "public"."platform_audit_logs" ("created_at", "id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_pal_created_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_tenants_status"`);
  }
}
