import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 184 — datos del operador para el contrato (cierre de venta, bloque A0; CA-11).
 *
 * Schema tenant. `operator_contract_profile` guarda una sola fila por empresa
 * (`tenant_id` como clave primaria). La razón social y el NIT NO se duplican: se leen
 * de `public.tenants` a través del módulo tenant. Todos los campos editables admiten
 * NULL: el faltante se informa con `missingOperatorContractFields` y la generación
 * del contrato lo exige.
 *
 * `down()` borra la tabla. Si ya hay datos lo bloquea salvo
 * `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true`: no hay backfill que los reconstruya.
 */
export class OperatorContractProfile1840000000184 implements MigrationInterface {
  name = 'OperatorContractProfile1840000000184';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS operator_contract_profile (
        tenant_id uuid PRIMARY KEY,
        quality_and_coverage_url varchar(500) NULL,
        customer_service_channels jsonb NOT NULL DEFAULT '[]'::jsonb,
        reconnection_fee numeric(14,2) NULL,
        annual_increase_cap_percent numeric(5,2) NULL,
        equipment_incident_report_channel varchar(500) NULL,
        other_conditions text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid NULL,
        CONSTRAINT chk_operator_contract_profile_channels_array
          CHECK (jsonb_typeof(customer_service_channels) = 'array'
                 AND jsonb_array_length(customer_service_channels) <= 10),
        CONSTRAINT chk_operator_contract_profile_reconnection_fee
          CHECK (reconnection_fee IS NULL OR reconnection_fee >= 0),
        CONSTRAINT chk_operator_contract_profile_increase_cap
          CHECK (annual_increase_cap_percent IS NULL
                 OR (annual_increase_cap_percent >= 0 AND annual_increase_cap_percent <= 100)),
        CONSTRAINT chk_operator_contract_profile_other_conditions
          CHECK (other_conditions IS NULL OR length(other_conditions) <= 10000)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      const exists = (await queryRunner.query(
        `SELECT to_regclass('operator_contract_profile') IS NOT NULL AS present`,
      )) as Array<{ present: boolean }>;
      if (exists[0]?.present) {
        const rows = (await queryRunner.query(
          `SELECT COUNT(*)::int AS total FROM operator_contract_profile`,
        )) as Array<{ total: number }>;
        const total = rows[0]?.total ?? 0;
        if (total > 0) {
          throw new Error(
            `Rollback de OperatorContractProfile bloqueado: hay ${total} perfil(es) del operador. ` +
              `Para continuar de forma destructiva, exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true.`,
          );
        }
      }
    }
    await queryRunner.query(`DROP TABLE IF EXISTS operator_contract_profile`);
  }
}
