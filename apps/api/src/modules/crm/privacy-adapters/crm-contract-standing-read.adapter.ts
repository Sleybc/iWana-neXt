import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { DataSource } from 'typeorm';
import { IContractStandingReadPort } from '../../privacy/requests/ports/contract-standing-read.port';

@Injectable()
export class CrmContractStandingReadAdapter implements IContractStandingReadPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async standing(partyId: string): Promise<{
    openContractIds: string[];
    lastTerminatedAt: string | null;
  }> {
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (queryRunner) => {
      const rows = (await queryRunner.query(
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
    });
  }
}
