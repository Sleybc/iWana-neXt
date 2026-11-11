import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { DataSource } from 'typeorm';
import type {
  ContractProvisioningActivationReadPort,
  ContractServiceStart,
  ContractServiceStartSource,
} from '../../crm/ports/contract-provisioning-activation-read.port';

/**
 * Fecha efectiva más temprana por contrato: `activated_at` o, sin activación, `certified_at`
 * del aprovisionamiento CERTIFIED. Excluye los liberados y los fallidos sin activación.
 */
const SERVICE_START_SQL = `
  SELECT DISTINCT ON (contract_id)
         contract_id::text AS contract_id,
         COALESCE(activated_at, certified_at) AS service_start_at,
         CASE WHEN activated_at IS NOT NULL THEN 'ACTIVATED' ELSE 'CERTIFIED' END AS source
  FROM service_provisionings
  WHERE tenant_id = $1
    AND contract_id = ANY($2::uuid[])
    AND status <> 'RELEASED'
    AND (activated_at IS NOT NULL OR (status = 'CERTIFIED' AND certified_at IS NOT NULL))
  ORDER BY contract_id, COALESCE(activated_at, certified_at) ASC
`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

interface ServiceStartRow {
  contract_id: string;
  service_start_at: Date | string;
  source: ContractServiceStartSource;
}

/** Adaptador MOD13 de la fecha efectiva de servicio activo por contrato (cierre de venta). */
@Injectable()
export class ContractProvisioningActivationReadAdapter implements ContractProvisioningActivationReadPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getServiceStart(contractId: string): Promise<ContractServiceStart | null> {
    const found = await this.listServiceStart([contractId]);
    return found.get(contractId.toLowerCase()) ?? null;
  }

  async listServiceStart(
    contractIds: readonly string[],
  ): Promise<Map<string, ContractServiceStart>> {
    const ids = [
      ...new Set(contractIds.filter((id) => UUID_PATTERN.test(id)).map((id) => id.toLowerCase())),
    ];
    const result = new Map<string, ContractServiceStart>();
    if (ids.length === 0) return result;

    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(SERVICE_START_SQL, [tenantId, ids]),
    )) as ServiceStartRow[];
    for (const row of rows) {
      const at =
        row.service_start_at instanceof Date
          ? row.service_start_at
          : new Date(row.service_start_at);
      result.set(row.contract_id, { at, source: row.source });
    }
    return result;
  }

  async listUnsignedBlockedProvisioningIds(contractId: string): Promise<string[]> {
    if (!UUID_PATTERN.test(contractId)) return [];
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(
        `SELECT id FROM service_provisionings
          WHERE tenant_id = $1 AND contract_id = $2 AND activated_at IS NOT NULL
            AND status <> 'RELEASED' AND commercial_activation_status = 'BLOCKED'
            AND commercial_activation_detail = 'CONTRACT_UNSIGNED'`,
        [tenantId, contractId],
      ),
    )) as Array<{ id: string }>;
    return rows.map((row) => row.id);
  }
}
