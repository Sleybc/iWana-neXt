import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 035 — `public.tenant_usage_snapshots` (ADR-114 D1, PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE4
 * §A.1). Última medición de suscriptores por empresa, escrita por el muestreador del worker.
 * Solo el conteo: ninguna columna con datos de suscriptores.
 *
 * La FK con `ON DELETE CASCADE` hace que la purga R7 (`iwana_purge_tenant_schema`, ADR-108),
 * que borra la fila de `public.tenants`, se lleve la medición (ADR-114 §7 condición 7).
 * Los permisos del rol de la app llegan por los privilegios por defecto del schema `public`.
 *
 * Schema: public
 * Reversible: sí (`down` borra la tabla; la medición se regenera en la siguiente hora).
 */
export class TenantUsageSnapshots1784419223000 implements MigrationInterface {
  name = 'TenantUsageSnapshots1784419223000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "public"."tenant_usage_snapshots" (
        "tenant_id" uuid NOT NULL,
        "active_subscribers" integer NOT NULL,
        "measured_at" timestamptz NOT NULL,
        CONSTRAINT "pk_tenant_usage_snapshots" PRIMARY KEY ("tenant_id"),
        CONSTRAINT "fk_tenant_usage_snapshots_tenant" FOREIGN KEY ("tenant_id")
          REFERENCES "public"."tenants" ("id") ON DELETE CASCADE,
        CONSTRAINT "chk_tenant_usage_snapshots_non_negative" CHECK ("active_subscribers" >= 0)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "public"."tenant_usage_snapshots"`);
  }
}
