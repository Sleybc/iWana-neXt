import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { PartyPrivacyMark, partyPrivacyMarkSchema } from '@iwana/shared';
import { DataSource } from 'typeorm';
import { PartyPrivacyMarkEntity } from '../entities/party-privacy-mark.entity';
import { withPrivacyTenant } from '../ports/privacy-tenant-query';

@Injectable()
export class MarksService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async listForParty(partyId: string): Promise<PartyPrivacyMark[]> {
    return withPrivacyTenant(this.dataSource, async (manager) => {
      const rows = await manager.getRepository(PartyPrivacyMarkEntity).find({
        where: { partyId },
        order: { occurredAt: 'DESC', id: 'DESC' },
      });
      const seen = new Set<string>();
      const active: PartyPrivacyMark[] = [];
      for (const row of rows) {
        if (seen.has(row.mark)) continue;
        seen.add(row.mark);
        if (row.event === 'OPEN') {
          active.push(
            partyPrivacyMarkSchema.parse({
              id: row.id,
              partyId: row.partyId,
              mark: row.mark,
              event: row.event,
              requestId: row.requestId,
              occurredAt: row.occurredAt.toISOString(),
            }),
          );
        }
      }
      return active;
    });
  }
}
