import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 036 — índice parcial de los eventos de empresa en `platform_audit_logs`
 * (decisión AI-EM-ARCH, 2026-11-22).
 *
 * `GET /tenants/summary` reconstruye «Activas al cierre» con los eventos de `Tenant`
 * (`listEntityStatusEvents`). La campana y el directorio lo llaman en cada carga. Sin este
 * índice, la consulta recorre toda la auditoría de plataforma (Seq Scan), y su costo crece con
 * todas las entidades auditadas, no solo con las empresas. El índice parcial cubre solo las
 * filas de `Tenant`, en el orden `(created_at, id)` que usa la consulta.
 *
 * Solo crea un índice; no toca datos.
 *
 * Schema: public
 * Reversible: sí.
 */
export class PlatformAuditTenantStatusEventsIndex1784419224000 implements MigrationInterface {
  name = 'PlatformAuditTenantStatusEventsIndex1784419224000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "idx_pal_tenant_created_id" ON "public"."platform_audit_logs" ("created_at", "id")
       WHERE "entity_type" = 'Tenant'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_pal_tenant_created_id"`);
  }
}
