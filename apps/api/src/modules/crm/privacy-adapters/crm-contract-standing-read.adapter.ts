import { TenantContext } from '@iwana/db';
import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { IContractStandingReadPort } from '../../privacy/requests/ports/contract-standing-read.port';

@Injectable()
export class CrmContractStandingReadAdapter implements IContractStandingReadPort {
  async standing(
    partyId: string | null,
    ctx: { manager: EntityManager; requesterDocumentHmac?: string | null },
  ): Promise<{
    subscriberIds: string[];
    contractIds: string[];
    expedienteIds: string[];
    openContractIds: string[];
    lastTerminatedAt: string | null;
  }> {
    const tenantId = TenantContext.getOrThrow().tenantId;
    const subscribers = (await ctx.manager.query(
      "SELECT s.id::text AS id, to_jsonb(s)->>'expediente_id' AS expediente_id FROM subscribers s WHERE s.party_id = $1 AND s.tenant_id = $2 ORDER BY s.id",
      [partyId, tenantId],
    )) as Array<{ id: string; expediente_id: string | null }>;
    const rows = (await ctx.manager.query(
      `SELECT COALESCE(array_agg(c.id ORDER BY c.id), ARRAY[]::uuid[]) AS contract_ids, COALESCE(array_agg(c.id ORDER BY c.id) FILTER (
                  WHERE c.status NOT IN ('TERMINATED', 'ARCHIVED')
                ), ARRAY[]::uuid[]) AS open_contract_ids,
                max(c.terminated_at) FILTER (
                  WHERE c.status IN ('TERMINATED', 'ARCHIVED')
                ) AS last_terminated_at
           FROM contracts c
           JOIN subscribers s ON s.id = c.subscriber_id AND s.tenant_id = c.tenant_id
          WHERE s.party_id = $1 AND s.tenant_id = $2 AND c.deleted_at IS NULL`,
      [partyId, tenantId],
    )) as Array<{
      contract_ids: string[];
      open_contract_ids: string[];
      last_terminated_at: Date | string | null;
    }>;
    const openContractIds = rows[0]?.open_contract_ids ?? [];
    const lastTerminatedAt = rows[0]?.last_terminated_at;
    const expedienteIds = subscribers.flatMap((row) =>
      row.expediente_id ? [row.expediente_id] : [],
    );
    if (ctx.requesterDocumentHmac) {
      const expedientes = (await ctx.manager.query(
        'SELECT id::text AS id FROM expediente_records WHERE document_number_hmac = $1 AND tenant_id = $2 ORDER BY id',
        [ctx.requesterDocumentHmac, tenantId],
      )) as Array<{ id: string }>;
      expedienteIds.push(...expedientes.map((row) => row.id));
    }
    return {
      contractIds: rows[0]?.contract_ids ?? [],
      expedienteIds: [...new Set(expedienteIds)].sort(),
      subscriberIds: subscribers.map(({ id }) => id),
      openContractIds,
      lastTerminatedAt: lastTerminatedAt ? new Date(lastTerminatedAt).toISOString() : null,
    };
  }
}
