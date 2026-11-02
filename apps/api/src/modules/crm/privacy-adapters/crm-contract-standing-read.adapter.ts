import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { IContractStandingReadPort } from '../../privacy/requests/ports/contract-standing-read.port';

@Injectable()
export class CrmContractStandingReadAdapter implements IContractStandingReadPort {
  async standing(
    partyId: string,
    ctx: { manager: EntityManager },
  ): Promise<{
    openContractIds: string[];
    lastTerminatedAt: string | null;
  }> {
    const rows = (await ctx.manager.query(
      `SELECT c.id,
                c.status,
                c.updated_at
           FROM contracts c
           JOIN subscribers s ON s.id = c.subscriber_id
          WHERE s.party_id = $1
          ORDER BY c.updated_at DESC NULLS LAST, c.id DESC`,
      [partyId],
    )) as Array<{ id: string; status: string; updated_at: Date | string | null }>;
    const openContractIds = rows
      .filter((row) => row.status !== 'TERMINATED' && row.status !== 'ARCHIVED')
      .map((row) => row.id);
    const lastTerminatedAt = rows.find((row) => row.status === 'TERMINATED')?.updated_at;
    return {
      openContractIds,
      lastTerminatedAt: lastTerminatedAt ? new Date(lastTerminatedAt).toISOString() : null,
    };
  }
}
