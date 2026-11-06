import { TenantContext } from '@iwana/db';
import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { IContractStandingReadPort } from '../../privacy/requests/ports/contract-standing-read.port';

@Injectable()
export class CrmContractStandingReadAdapter implements IContractStandingReadPort {
  async standing(
    partyId: string,
    ctx: { manager: EntityManager },
  ): Promise<{
    subscriberIds: string[];
    openContractIds: string[];
    lastTerminatedAt: string | null;
  }> {
    const tenantId = TenantContext.getOrThrow().tenantId;
    const subscribers = (await ctx.manager.query(
      'SELECT id::text AS id FROM subscribers WHERE party_id = $1 AND tenant_id = $2 ORDER BY id',
      [partyId, tenantId],
    )) as Array<{ id: string }>;
    const rows = (await ctx.manager.query(
      `SELECT COALESCE(array_agg(c.id ORDER BY c.id) FILTER (
                  WHERE c.status NOT IN ('TERMINATED', 'ARCHIVED')
                ), ARRAY[]::uuid[]) AS open_contract_ids,
                max(c.terminated_at) FILTER (
                  WHERE c.status IN ('TERMINATED', 'ARCHIVED')
                ) AS last_terminated_at
           FROM contracts c
           JOIN subscribers s ON s.id = c.subscriber_id AND s.tenant_id = c.tenant_id
          WHERE s.party_id = $1 AND s.tenant_id = $2 AND c.deleted_at IS NULL`,
      [partyId, tenantId],
    )) as Array<{ open_contract_ids: string[]; last_terminated_at: Date | string | null }>;
    const openContractIds = rows[0]?.open_contract_ids ?? [];
    const lastTerminatedAt = rows[0]?.last_terminated_at;
    return {
      subscriberIds: subscribers.map(({ id }) => id),
      openContractIds,
      lastTerminatedAt: lastTerminatedAt ? new Date(lastTerminatedAt).toISOString() : null,
    };
  }
}
