import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 158: registra el historial de ciclo de vida y el último motivo de contrato.
 *
 * La tabla es aditiva y no transforma datos existentes. Si el historial ya contiene filas,
 * `down()` exige autorización explícita porque revertirlo borraría evidencia operativa creada
 * después de esta migración.
 */
export class CreateCrmLifecycleChanges1580000000000 implements MigrationInterface {
  name = 'CreateCrmLifecycleChanges1580000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE crm_lifecycle_changes (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        entity_type varchar(16) NOT NULL,
        entity_id uuid NOT NULL,
        subscriber_id uuid NOT NULL,
        from_status varchar(30) NOT NULL,
        to_status varchar(30) NOT NULL,
        reason_code varchar(40) NOT NULL,
        note_encrypted text,
        contract_scope_explicit boolean NOT NULL DEFAULT FALSE,
        source varchar(16) NOT NULL,
        batch_id uuid NOT NULL,
        actor_id uuid,
        changed_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_crm_lifecycle_changes PRIMARY KEY (id),
        CONSTRAINT fk_crm_lifecycle_changes_subscriber
          FOREIGN KEY (subscriber_id) REFERENCES subscribers (id),
        CONSTRAINT ck_crm_lifecycle_changes_entity_type
          CHECK (entity_type IN ('SUBSCRIBER', 'CONTRACT')),
        CONSTRAINT ck_crm_lifecycle_changes_source
          CHECK (source IN ('MANUAL', 'SYSTEM', 'BILLING')),
        CONSTRAINT ck_crm_lifecycle_changes_reason_code
          CHECK (reason_code IN (
            'MORA',
            'SOLICITUD_TITULAR',
            'USO_INDEBIDO',
            'ORDEN_AUTORIDAD',
            'FALLA_TECNICA_PROLONGADA',
            'PAGO_REGISTRADO',
            'FIN_SUSPENSION_SOLICITADA',
            'CORRECCION_OPERATIVA',
            'LEVANTAMIENTO_ORDEN',
            'MORA_PROLONGADA',
            'TRASLADO_SIN_COBERTURA',
            'DUPLICADO',
            'DESCARTE_EXPEDIENTE'
          ))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_lifecycle_subscriber
        ON crm_lifecycle_changes (tenant_id, subscriber_id, changed_at DESC)
    `);
    await queryRunner.query(`
      ALTER TABLE contracts
        ADD COLUMN status_reason_code varchar(40),
        ADD COLUMN status_changed_at timestamptz
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.assertNoHistoryWithoutExplicitAuthorization(queryRunner);
    await queryRunner.query(`DROP TABLE IF EXISTS crm_lifecycle_changes`);
    await queryRunner.query(`
      ALTER TABLE contracts
        DROP COLUMN IF EXISTS status_reason_code,
        DROP COLUMN IF EXISTS status_changed_at
    `);
  }

  private async assertNoHistoryWithoutExplicitAuthorization(
    queryRunner: QueryRunner,
  ): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] === 'true') return;

    const relation = (await queryRunner.query(
      `SELECT to_regclass('crm_lifecycle_changes') IS NOT NULL AS present`,
    )) as Array<{ present: boolean }>;
    if (relation[0]?.present !== true) return;

    const rows = (await queryRunner.query(
      `SELECT COUNT(*)::int AS total FROM crm_lifecycle_changes`,
    )) as Array<{ total: number }>;
    const total = rows[0]?.total ?? 0;
    if (total === 0) return;

    throw new Error(
      `Rollback de CreateCrmLifecycleChanges bloqueado: hay ${total} fila(s) de historial. ` +
        `Para continuar de forma destructiva, exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true de forma explícita.`,
    );
  }
}
