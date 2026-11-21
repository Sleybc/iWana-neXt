import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 034 — `public.platform_health_samples` (PROMPT-WEB-CENTRO-CONTROL-PULSO-FASE3-v1.0,
 * §Diseño del muestreo). Muestras de salud cada 5 min escritas por el worker; sin `tenant_id`
 * ni datos de empresa. `api_ok` admite `NULL`: el API no se midió y no cuenta como muestra.
 *
 * Los permisos del rol de la app llegan por los privilegios por defecto del schema `public`.
 *
 * Schema: public
 * Reversible: sí (`down` borra la tabla y sus muestras, que son telemetría regenerable).
 */
export class PlatformHealthSamples1784419222000 implements MigrationInterface {
  name = 'PlatformHealthSamples1784419222000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "public"."platform_health_samples" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "sampled_at" timestamptz NOT NULL,
        "api_ok" boolean,
        "db_ok" boolean NOT NULL,
        "redis_ok" boolean NOT NULL,
        "queues" jsonb NOT NULL DEFAULT '[]'::jsonb,
        CONSTRAINT "pk_platform_health_samples" PRIMARY KEY ("id"),
        CONSTRAINT "chk_platform_health_samples_queues_array"
          CHECK (jsonb_typeof("queues") = 'array')
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_platform_health_samples_sampled_at"
         ON "public"."platform_health_samples" ("sampled_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_platform_health_samples_sampled_at"`);
    await queryRunner.query(`DROP TABLE "public"."platform_health_samples"`);
  }
}
