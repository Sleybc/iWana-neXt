import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { DataSource } from 'typeorm';
import type { ContractProvisioningActivationReadPort } from '../../crm/ports/contract-provisioning-activation-read.port';

/** Primera activación de los aprovisionamientos no liberados, agrupada por contrato. */
const ACTIVATED_AT_SQL = `
  SELECT contract_id::text AS contract_id, MIN(activated_at) AS activated_at
  FROM service_provisionings
  WHERE tenant_id = $1
    AND contract_id = ANY($2::uuid[])
    AND activated_at IS NOT NULL
    AND status <> 'RELEASED'
  GROUP BY contract_id
`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

interface ActivatedAtRow {
  contract_id: string;
  activated_at: Date | string;
}

/** Adaptador MOD13 de la fecha de activación por contrato (cierre de venta, bloque F). */
@Injectable()
export class ContractProvisioningActivationReadAdapter implements ContractProvisioningActivationReadPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getProvisioningActivatedAt(contractId: string): Promise<Date | null> {
    const found = await this.listProvisioningActivatedAt([contractId]);
    return found.get(contractId.toLowerCase()) ?? null;
  }

  async listProvisioningActivatedAt(contractIds: readonly string[]): Promise<Map<string, Date>> {
    const ids = [
      ...new Set(contractIds.filter((id) => UUID_PATTERN.test(id)).map((id) => id.toLowerCase())),
    ];
    const result = new Map<string, Date>();
    if (ids.length === 0) return result;

    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const rows = (await runInTenantSchema(this.dataSource, schemaName, (qr) =>
      qr.query(ACTIVATED_AT_SQL, [tenantId, ids]),
    )) as ActivatedAtRow[];
    for (const row of rows) {
      result.set(
        row.contract_id,
        row.activated_at instanceof Date ? row.activated_at : new Date(row.activated_at),
      );
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
