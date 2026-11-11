import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 192 — contrato automático al pasar la oportunidad a «lista para instalación»
 * (cierre de venta fase 2, bloques A+B; D3, D-F2, CA-1 a CA-3).
 *
 * - `contracts.source_expediente_id`: expediente que originó el contrato creado de forma
 *   automática. Índice único parcial (vivos y con origen) que garantiza un solo contrato
 *   automático por expediente aunque el evento se repita o llegue en paralelo. Los contratos
 *   manuales quedan en NULL: la creación manual desde la ficha no cambia.
 * - `subscribers.contract_auto_creation_issue`: aviso persistido «No se pudo crear el contrato:
 *   falta X» que lee la ficha. Solo códigos (`reason`, `missing[]`, `detectedAt`); nunca texto
 *   libre ni datos del titular. Se limpia al crear el contrato (manual o automático).
 *
 * Sin backfill: columnas nuevas y nulas. `down()` las retira y pierde el vínculo de origen y
 * los avisos: si hay algún `source_expediente_id` o aviso no nulo lo bloquea salvo
 * `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true` (sin el vínculo, un evento repetido podría crear
 * un segundo contrato automático para la misma oportunidad).
 */
export class ContractAutoCreationFromExpediente1920000000192 implements MigrationInterface {
  name = 'ContractAutoCreationFromExpediente1920000000192';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contracts
        ADD COLUMN IF NOT EXISTS source_expediente_id uuid NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_contracts_source_expediente
        ON contracts (source_expediente_id)
        WHERE source_expediente_id IS NOT NULL AND deleted_at IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE subscribers
        ADD COLUMN IF NOT EXISTS contract_auto_creation_issue jsonb NULL
    `);
    await queryRunner.query(
      `ALTER TABLE subscribers DROP CONSTRAINT IF EXISTS chk_subscribers_contract_auto_creation_issue`,
    );
    await queryRunner.query(`
      ALTER TABLE subscribers
        ADD CONSTRAINT chk_subscribers_contract_auto_creation_issue CHECK (
          contract_auto_creation_issue IS NULL
          OR (jsonb_typeof(contract_auto_creation_issue) = 'object'
              AND jsonb_typeof(contract_auto_creation_issue -> 'missing') = 'array')
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      const rows = (await queryRunner.query(`
        SELECT (SELECT COUNT(*)::int FROM contracts WHERE source_expediente_id IS NOT NULL)
                 AS contracts,
               (SELECT COUNT(*)::int FROM subscribers
                 WHERE contract_auto_creation_issue IS NOT NULL) AS issues
      `)) as Array<{ contracts: number; issues: number }>;
      const contracts = rows[0]?.contracts ?? 0;
      const issues = rows[0]?.issues ?? 0;
      if (contracts > 0 || issues > 0) {
        throw new Error(
          `Rollback de ContractAutoCreationFromExpediente bloqueado: ${contracts} contrato(s) ` +
            `con expediente de origen y ${issues} aviso(s) de contrato automático. Para ` +
            `continuar de forma destructiva, exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true.`,
        );
      }
    }
    await queryRunner.query(
      `ALTER TABLE subscribers DROP CONSTRAINT IF EXISTS chk_subscribers_contract_auto_creation_issue`,
    );
    await queryRunner.query(
      `ALTER TABLE subscribers DROP COLUMN IF EXISTS contract_auto_creation_issue`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS uq_contracts_source_expediente`);
    await queryRunner.query(`ALTER TABLE contracts DROP COLUMN IF EXISTS source_expediente_id`);
  }
}
