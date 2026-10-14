import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { PrivacyMark } from '@iwana/shared';
import { DataSource, In } from 'typeorm';
import { PartyPrivacyMarkEntity } from '../entities/party-privacy-mark.entity';
import { IPrivacyMarksReadPort } from '../ports/privacy-marks-read.port';
import { withPrivacyTenant } from '../ports/privacy-tenant-query';

@Injectable()
export class PrivacyMarksAdapter implements IPrivacyMarksReadPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async activeMarks(partyIds: string[]): Promise<Record<string, PrivacyMark[]>> {
    const result: Record<string, PrivacyMark[]> = Object.fromEntries(
      partyIds.map((partyId) => [partyId, []]),
    );
    if (partyIds.length === 0) return result;

    return withPrivacyTenant(this.dataSource, async (manager) => {
      const rows = await manager.getRepository(PartyPrivacyMarkEntity).find({
        where: { partyId: In(partyIds) },
        order: { occurredAt: 'DESC', id: 'DESC' },
      });
      const latest = new Map<string, PartyPrivacyMarkEntity>();
      for (const row of rows) {
        if (!latest.has(`${row.partyId}:${row.mark}`)) {
          latest.set(`${row.partyId}:${row.mark}`, row);
        }
      }
      for (const row of latest.values()) {
        if (row.event === 'OPEN') {
          result[row.partyId]?.push(row.mark as PrivacyMark);
        }
      }
      return result;
    });
  }
}
