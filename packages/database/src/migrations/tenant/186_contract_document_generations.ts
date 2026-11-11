import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 186 — generación del PDF del contrato (cierre de venta, bloque B; ADR-109 D5, CA-14).
 *
 * Schema tenant. `contract_document_generations` registra cada solicitud de generación:
 * - `snapshot_encrypted`: snapshot inmutable del contrato (titular con documento completo,
 *   plan, precio, IVA, dirección, equipos, permanencia) cifrado con AES-256-GCM (clave PII).
 *   Solo existe en solicitudes encoladas; las rechazadas por validación no lo guardan.
 * - `snapshot_sha256`: idempotencia por contrato y versión del snapshot (mismos datos y
 *   plantilla → misma generación). Índice único parcial sobre PENDING/READY.
 * - `document_object_key` / `document_sha256`: PDF cifrado en el almacenamiento de medios y
 *   huella SHA-256 del PDF en claro; obligatorios en READY.
 * Los CHECK reproducen las reglas de `ContractDocumentGenerationSchema` (@iwana/shared).
 *
 * `down()` borra la tabla. Si hay filas lo bloquea salvo
 * `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true`: los snapshots no se reconstruyen.
 */
export class ContractDocumentGenerations1860000000186 implements MigrationInterface {
  name = 'ContractDocumentGenerations1860000000186';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contract_document_generations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        contract_id uuid NOT NULL REFERENCES contracts (id),
        execution_order_id uuid NULL,
        status varchar(16) NOT NULL,
        template_legal_text_id uuid NULL,
        template_version varchar(32) NULL,
        snapshot_encrypted text NULL,
        snapshot_sha256 char(64) NULL,
        document_object_key varchar(500) NULL,
        document_sha256 char(64) NULL,
        failure_reason varchar(40) NULL,
        missing_operator_fields text[] NOT NULL DEFAULT '{}',
        attempts integer NOT NULL DEFAULT 0,
        requested_by uuid NOT NULL,
        requested_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_cdg_status CHECK (status IN ('PENDING', 'READY', 'FAILED')),
        CONSTRAINT chk_cdg_failure_reason CHECK (
          failure_reason IS NULL OR failure_reason IN
            ('TEMPLATE_NOT_APPROVED', 'OPERATOR_DATA_MISSING', 'SUBSCRIBER_BLOCKED', 'RENDER_FAILED')
        ),
        CONSTRAINT chk_cdg_ready CHECK (
          status <> 'READY' OR (
            document_sha256 IS NOT NULL AND document_object_key IS NOT NULL
            AND completed_at IS NOT NULL AND template_version IS NOT NULL
            AND template_legal_text_id IS NOT NULL
          )
        ),
        CONSTRAINT chk_cdg_failed CHECK (
          (status = 'FAILED') = (failure_reason IS NOT NULL)
          AND (status <> 'FAILED' OR completed_at IS NOT NULL)
        ),
        CONSTRAINT chk_cdg_document_only_ready CHECK (status = 'READY' OR document_sha256 IS NULL),
        CONSTRAINT chk_cdg_missing_fields CHECK (
          (failure_reason IS NOT DISTINCT FROM 'OPERATOR_DATA_MISSING')
            = (cardinality(missing_operator_fields) > 0)
        ),
        CONSTRAINT chk_cdg_pending_snapshot CHECK (
          status <> 'PENDING' OR (snapshot_encrypted IS NOT NULL AND snapshot_sha256 IS NOT NULL)
        ),
        CONSTRAINT chk_cdg_sha256_format CHECK (
          (document_sha256 IS NULL OR document_sha256 ~ '^[0-9a-f]{64}$')
          AND (snapshot_sha256 IS NULL OR snapshot_sha256 ~ '^[0-9a-f]{64}$')
        )
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_cdg_contract_snapshot_active
        ON contract_document_generations (tenant_id, contract_id, snapshot_sha256)
        WHERE status IN ('PENDING', 'READY')
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_cdg_contract_requested
        ON contract_document_generations (contract_id, requested_at DESC, id DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      const exists = (await queryRunner.query(
        `SELECT to_regclass('contract_document_generations') IS NOT NULL AS present`,
      )) as Array<{ present: boolean }>;
      if (exists[0]?.present) {
        const rows = (await queryRunner.query(
          `SELECT COUNT(*)::int AS total FROM contract_document_generations`,
        )) as Array<{ total: number }>;
        const total = rows[0]?.total ?? 0;
        if (total > 0) {
          throw new Error(
            `Rollback de ContractDocumentGenerations bloqueado: la tabla contiene ${total} fila(s). ` +
              `Para continuar de forma destructiva, exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true.`,
          );
        }
      }
    }
    await queryRunner.query(`DROP INDEX IF EXISTS idx_cdg_contract_requested`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_cdg_contract_snapshot_active`);
    await queryRunner.query(`DROP TABLE IF EXISTS contract_document_generations`);
  }
}
