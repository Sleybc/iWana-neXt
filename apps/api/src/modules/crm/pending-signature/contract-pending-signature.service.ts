import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import type { DataSource, EntityManager } from 'typeorm';
import {
  CONTRACT_PROVISIONING_ACTIVATION_READ_PORT,
  type ContractProvisioningActivationReadPort,
} from '../ports/contract-provisioning-activation-read.port';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
/** Tope por corrida: los restantes se avisan al día siguiente. */
const MAX_CANDIDATES_PER_RUN = 5_000;

const CONTRACT_STATUS_SQL = `
  SELECT status::text AS status
  FROM contracts
  WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
`;

const DRAFT_BY_SUBSCRIBER_SQL = `
  SELECT id::text AS contract_id, subscriber_id::text AS subscriber_id
  FROM contracts
  WHERE tenant_id = $1
    AND subscriber_id = ANY($2::uuid[])
    AND status = 'DRAFT'
    AND deleted_at IS NULL
`;

const UNALERTED_DRAFT_SQL = `
  SELECT c.id::text AS contract_id
  FROM contracts c
  WHERE c.tenant_id = $1
    AND c.status = 'DRAFT'
    AND c.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM contract_pending_signature_alerts a
      WHERE a.tenant_id = c.tenant_id
        AND a.contract_id = c.id
        AND a.threshold_hours = $2
    )
  ORDER BY c.created_at, c.id
  LIMIT ${MAX_CANDIDATES_PER_RUN}
`;

const RECORD_ALERTS_SQL = `
  INSERT INTO contract_pending_signature_alerts
    (tenant_id, contract_id, threshold_hours, recipients_count)
  SELECT $1, candidate, $3, $4
  FROM unnest($2::uuid[]) AS candidate
  ON CONFLICT (tenant_id, contract_id, threshold_hours) DO NOTHING
  RETURNING contract_id::text AS contract_id
`;

/**
 * Contrato pendiente de firma (ADR-109 D3): contrato en `DRAFT` cuyo servicio ya fue activado
 * por MOD13. La firma lo pasa a `ACTIVE` (bloque D), así que `DRAFT` equivale a «sin firma».
 * La fecha de activación se lee por el puerto de MOD13; CRM nunca lee `service_provisionings`.
 */
@Injectable()
export class ContractPendingSignatureService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(CONTRACT_PROVISIONING_ACTIVATION_READ_PORT)
    private readonly activationReadPort: ContractProvisioningActivationReadPort,
  ) {}

  /** true si el contrato existe en el tenant actual y sigue en `DRAFT` (sin firma). */
  async isContractUnsigned(contractId: string): Promise<boolean> {
    if (!UUID_PATTERN.test(contractId)) return false;
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(CONTRACT_STATUS_SQL, [tenantId, contractId]),
    )) as Array<{ status: string }>;
    return rows[0]?.status === 'DRAFT';
  }

  /** Suscriptores con al menos un contrato sin firma y servicio ya activado. */
  async subscribersPendingSignature(subscriberIds: readonly string[]): Promise<Set<string>> {
    const ids = [...new Set(subscriberIds.filter((id) => UUID_PATTERN.test(id)))];
    const pending = new Set<string>();
    if (ids.length === 0) return pending;

    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const drafts = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(DRAFT_BY_SUBSCRIBER_SQL, [tenantId, ids]),
    )) as Array<{ contract_id: string; subscriber_id: string }>;
    if (drafts.length === 0) return pending;

    const activated = await this.activationReadPort.listProvisioningActivatedAt(
      drafts.map((row) => row.contract_id),
    );
    for (const row of drafts) {
      if (activated.has(row.contract_id)) pending.add(row.subscriber_id);
    }
    return pending;
  }

  /**
   * Contratos sin firma cuya activación tiene al menos `thresholdHours` y que aún no tienen
   * aviso registrado para ese umbral.
   */
  async listDueForAlert(thresholdHours: number, now: Date): Promise<string[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const candidates = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(UNALERTED_DRAFT_SQL, [tenantId, thresholdHours]),
    )) as Array<{ contract_id: string }>;
    if (candidates.length === 0) return [];

    const activated = await this.activationReadPort.listProvisioningActivatedAt(
      candidates.map((row) => row.contract_id),
    );
    const cutoff = now.getTime() - thresholdHours * 60 * 60 * 1_000;
    return candidates
      .map((row) => row.contract_id)
      .filter((contractId) => {
        const activatedAt = activated.get(contractId);
        return activatedAt !== undefined && activatedAt.getTime() <= cutoff;
      });
  }

  /**
   * Registra el aviso por contrato y umbral dentro de la transacción del llamante. Devuelve
   * solo los contratos que no tenían aviso: la unicidad de la tabla hace idempotente el envío.
   */
  async recordAlerts(
    manager: EntityManager,
    contractIds: readonly string[],
    thresholdHours: number,
    recipientsCount: number,
  ): Promise<string[]> {
    if (contractIds.length === 0) return [];
    const { tenantId } = TenantContext.getOrThrow();
    const rows = (await manager.query(RECORD_ALERTS_SQL, [
      tenantId,
      [...contractIds],
      thresholdHours,
      recipientsCount,
    ])) as Array<{ contract_id: string }>;
    return rows.map((row) => row.contract_id);
  }
}
